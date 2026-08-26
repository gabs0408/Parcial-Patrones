<#
.SYNOPSIS
  Despliega un microservicio (imagen Docker -> ECR -> Secrets Manager ->
  Rol IAM de mínimo privilegio -> Lambda) siguiendo exactamente el mismo
  patrón validado con "intake-triage".

.EJEMPLO
  .\deploy-service.ps1 -ServiceName "dispatch-assignment" -SecretJsonPath ".\dispatch-assignment\secret.json"

  El archivo secret.json debe tener este formato (mismo que usaste antes):
  {
    "SUPABASE_URL": "https://gmmztxqokjvyzylmepwb.supabase.co",
    "SUPABASE_SERVICE_ROLE_KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbXp0eHFva2p2eXp5bG1lcHdiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzMxNTMxOSwiZXhwIjoyMTAyODkxMzE5fQ.kODYqeZprYKHjzQoF1VDL25hXgJj69E6hgf8diSqbzA"
  }

.NOTAS
  - Corre este script desde la carpeta "services/" de tu repo (la carpeta
    que contiene intake-triage/, dispatch-assignment/, etc.)
  - Requiere que trust-policy.json esté en "infra/trust-policy.json"
    (un nivel arriba de services/, o ajusta $TrustPolicyPath abajo).
  - Es seguro volver a correrlo: si el repositorio ECR, el secreto o el
    rol ya existen, el script lo detecta y sigue adelante sin fallar.
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$ServiceName,

  [Parameter(Mandatory = $true)]
  [string]$SecretJsonPath,

  [string]$AwsAccountId = "185658217743",
  [string]$Region = "us-east-1",
  [string]$TrustPolicyPath = "..\infra\trust-policy.json"
)

$ErrorActionPreference = "Stop"

# Compatibilidad con PowerShell 7.3+: por defecto, esa versión trata la
# salida de error de comandos externos (como "aws") como un error
# terminante de PowerShell, incluso si se redirige con "2>$null". Esto
# rompe los chequeos de "¿ya existe este recurso?" que hace el script.
# Desactivamos ese comportamiento para que readable-solo-cuando-falla
# funcione como se espera.
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$ImageUri = "$AwsAccountId.dkr.ecr.$Region.amazonaws.com/$ServiceName`:latest"
$SecretName = "emergencias/$ServiceName"
$RoleName = "$ServiceName-lambda-role"
$FunctionName = $ServiceName

Write-Host "`n=== Desplegando '$ServiceName' ===" -ForegroundColor Cyan

# ---------------------------------------------------------
# 1. Build de la imagen (sin attestations, Lambda no las soporta)
# ---------------------------------------------------------
Write-Host "`n[1/7] Construyendo imagen Docker..." -ForegroundColor Yellow
Push-Location $ServiceName
docker build --provenance=false --sbom=false -t "${ServiceName}:local" .
if ($LASTEXITCODE -ne 0) { throw "Falló el docker build" }
Pop-Location

# ---------------------------------------------------------
# 2. Repositorio ECR (créalo si no existe)
# ---------------------------------------------------------
Write-Host "`n[2/7] Verificando repositorio ECR..." -ForegroundColor Yellow
$repoExists = $null
try {
  $repoExists = aws ecr describe-repositories --repository-names $ServiceName --region $Region --output json 2>$null
} catch {
  $repoExists = $null
}
if (-not $repoExists) {
  aws ecr create-repository --repository-name $ServiceName --region $Region | Out-Null
  Write-Host "  Repositorio creado." -ForegroundColor Green
} else {
  Write-Host "  Ya existía, se reutiliza." -ForegroundColor Green
}

# ---------------------------------------------------------
# 3. Login, tag y push a ECR
# ---------------------------------------------------------
Write-Host "`n[3/7] Subiendo imagen a ECR..." -ForegroundColor Yellow
$loginPassword = aws ecr get-login-password --region $Region
$loginPassword | docker login --username AWS --password-stdin "$AwsAccountId.dkr.ecr.$Region.amazonaws.com" | Out-Null
docker tag "${ServiceName}:local" $ImageUri
docker push $ImageUri
if ($LASTEXITCODE -ne 0) { throw "Falló el docker push" }

# ---------------------------------------------------------
# 4. Secreto en Secrets Manager (créalo si no existe)
# ---------------------------------------------------------
Write-Host "`n[4/7] Verificando secreto en Secrets Manager..." -ForegroundColor Yellow
$secretExists = $null
try {
  $secretExists = aws secretsmanager describe-secret --secret-id $SecretName --region $Region --output json 2>$null
} catch {
  $secretExists = $null
}
if (-not $secretExists) {
  $createResult = aws secretsmanager create-secret --name $SecretName --region $Region --secret-string "file://$SecretJsonPath" | ConvertFrom-Json
  $SecretArn = $createResult.ARN
  Write-Host "  Secreto creado: $SecretArn" -ForegroundColor Green
} else {
  $describeResult = aws secretsmanager describe-secret --secret-id $SecretName --region $Region | ConvertFrom-Json
  $SecretArn = $describeResult.ARN
  Write-Host "  Ya existía, se reutiliza: $SecretArn" -ForegroundColor Green
}

# ---------------------------------------------------------
# 5. Rol IAM de ejecución (créalo si no existe)
# ---------------------------------------------------------
Write-Host "`n[5/7] Verificando rol IAM..." -ForegroundColor Yellow
$roleExists = $null
try {
  $roleExists = aws iam get-role --role-name $RoleName --output json 2>$null
} catch {
  $roleExists = $null
}
if (-not $roleExists) {
  $roleResult = aws iam create-role --role-name $RoleName --assume-role-policy-document "file://$TrustPolicyPath" | ConvertFrom-Json
  $RoleArn = $roleResult.Role.Arn
  Write-Host "  Rol creado: $RoleArn" -ForegroundColor Green

  aws iam attach-role-policy --role-name $RoleName --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" | Out-Null

  # Política inline: SOLO puede leer este secreto específico (least privilege real)
  $secretPolicy = @{
    Version = "2012-10-17"
    Statement = @(
      @{
        Effect = "Allow"
        Action = "secretsmanager:GetSecretValue"
        Resource = $SecretArn
      }
    )
  } | ConvertTo-Json -Depth 5

  $secretPolicyPath = [System.IO.Path]::GetTempFileName()
  Set-Content -Path $secretPolicyPath -Value $secretPolicy

  aws iam put-role-policy --role-name $RoleName --policy-name "read-supabase-secret" --policy-document "file://$secretPolicyPath" | Out-Null
  Remove-Item $secretPolicyPath

  Write-Host "  Permisos mínimos adjuntados (logs + lectura de este secreto)." -ForegroundColor Green
  Write-Host "  Esperando propagación de IAM (15s)..." -ForegroundColor Yellow
  Start-Sleep -Seconds 15
} else {
  $roleData = aws iam get-role --role-name $RoleName | ConvertFrom-Json
  $RoleArn = $roleData.Role.Arn
  Write-Host "  Ya existía, se reutiliza: $RoleArn" -ForegroundColor Green
}

# ---------------------------------------------------------
# 6. Función Lambda (créala o actualízala si ya existe)
# ---------------------------------------------------------
Write-Host "`n[6/7] Verificando función Lambda..." -ForegroundColor Yellow
$fnExists = $null
try {
  $fnExists = aws lambda get-function --function-name $FunctionName --region $Region --output json 2>$null
} catch {
  $fnExists = $null
}
if (-not $fnExists) {
  aws lambda create-function `
    --function-name $FunctionName `
    --package-type Image `
    --code ImageUri=$ImageUri `
    --role $RoleArn `
    --region $Region `
    --timeout 15 `
    --memory-size 512 | Out-Null
  Write-Host "  Función Lambda creada." -ForegroundColor Green
} else {
  Write-Host "  Ya existía, actualizando el código con la nueva imagen..." -ForegroundColor Yellow
  aws lambda update-function-code `
    --function-name $FunctionName `
    --image-uri $ImageUri `
    --region $Region | Out-Null
  Write-Host "  Función Lambda actualizada." -ForegroundColor Green
}

# ---------------------------------------------------------
# 7. Resumen
# ---------------------------------------------------------
Write-Host "`n[7/7] Listo." -ForegroundColor Green
Write-Host "`n=== Resumen de '$ServiceName' ===" -ForegroundColor Cyan
Write-Host "  Imagen ECR:      $ImageUri"
Write-Host "  Secreto:         $SecretArn"
Write-Host "  Rol IAM:         $RoleArn"
Write-Host "  Función Lambda:  $FunctionName"
Write-Host "`nProbar con:"
Write-Host "  aws lambda invoke --function-name $FunctionName --region $Region --payload file://evento.json --cli-binary-format raw-in-base64-out respuesta.json"