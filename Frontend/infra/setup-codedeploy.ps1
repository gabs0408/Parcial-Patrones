<#
.SYNOPSIS
  Crea la infraestructura de CodeDeploy necesaria para desplegar una
  Lambda con estrategia Canary: rol IAM para CodeDeploy, Application, y
  Deployment Group conectado al alias "prod" y a las alarmas de
  CloudWatch ya creadas.

.EJEMPLO
  .\setup-codedeploy.ps1 -ServiceName "intake-triage"

.NOTAS
  Requiere haber corrido antes:
    - setup-canary-alias.ps1  (versión + alias "prod")
    - setup-canary-alarms.ps1 (las 2 alarmas)
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$ServiceName,

  [string]$AwsAccountId = "185658217743",
  [string]$Region = "us-east-1",
  [string]$DeploymentConfig = "CodeDeployDefault.LambdaCanary10Percent5Minutes"
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$RoleName = "codedeploy-lambda-role"
$AppName = "$ServiceName-app"
$DgName = "$ServiceName-dg"

Write-Host "`n=== Configurando CodeDeploy para '$ServiceName' ===" -ForegroundColor Cyan

# ---------------------------------------------------------
# 1. Rol IAM para CodeDeploy (uno solo, compartido por todos los
#    microservicios — CodeDeploy siempre actúa de la misma forma:
#    mover alias de Lambda y leer alarmas de CloudWatch).
# ---------------------------------------------------------
Write-Host "`n[1/4] Verificando rol IAM para CodeDeploy..." -ForegroundColor Yellow
$roleExists = $null
try {
  $roleExists = aws iam get-role --role-name $RoleName --output json 2>$null
} catch { $roleExists = $null }

if (-not $roleExists) {
  $trustPolicy = @{
    Version = "2012-10-17"
    Statement = @(
      @{
        Effect = "Allow"
        Principal = @{ Service = "codedeploy.amazonaws.com" }
        Action = "sts:AssumeRole"
      }
    )
  } | ConvertTo-Json -Depth 5

  $trustPolicyFile = Join-Path $env:TEMP "codedeploy-trust-policy.json"
  $utf8SinBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($trustPolicyFile, $trustPolicy, $utf8SinBom)

  aws iam create-role --role-name $RoleName --assume-role-policy-document "file://$trustPolicyFile" | Out-Null
  aws iam attach-role-policy --role-name $RoleName --policy-arn "arn:aws:iam::aws:policy/AWSCodeDeployRoleForLambda" | Out-Null
  Remove-Item $trustPolicyFile -ErrorAction SilentlyContinue

  Write-Host "  Rol '$RoleName' creado con permisos AWSCodeDeployRoleForLambdaLimited." -ForegroundColor Green
  Write-Host "  Esperando propagación de IAM (15s)..." -ForegroundColor Yellow
  Start-Sleep -Seconds 15
} else {
  Write-Host "  Ya existía, se reutiliza." -ForegroundColor Green
}
$RoleArn = "arn:aws:iam::${AwsAccountId}:role/${RoleName}"

# ---------------------------------------------------------
# 2. Application de CodeDeploy (compute platform: Lambda)
# ---------------------------------------------------------
Write-Host "`n[2/4] Verificando Application de CodeDeploy..." -ForegroundColor Yellow
$appExists = $null
try {
  $appExists = aws deploy get-application --application-name $AppName --region $Region --output json 2>$null
} catch { $appExists = $null }

if (-not $appExists) {
  aws deploy create-application --application-name $AppName --compute-platform Lambda --region $Region | Out-Null
  Write-Host "  Application '$AppName' creada." -ForegroundColor Green
} else {
  Write-Host "  Ya existía, se reutiliza." -ForegroundColor Green
}

# ---------------------------------------------------------
# 3. Deployment Group: conecta la Application con el alias de Lambda,
#    la configuración de tráfico Canary, y las alarmas de rollback.
# ---------------------------------------------------------
Write-Host "`n[3/4] Verificando Deployment Group..." -ForegroundColor Yellow
$dgExists = $null
try {
  $dgExists = aws deploy get-deployment-group --application-name $AppName --deployment-group-name $DgName --region $Region --output json 2>$null
} catch { $dgExists = $null }

$alarmConfigObj = @{
  enabled = $true
  alarms = @(
    @{ name = "$ServiceName-canary-errors" }
    @{ name = "$ServiceName-canary-latency" }
  )
} | ConvertTo-Json -Depth 5

$autoRollbackObj = @{
  enabled = $true
  events = @("DEPLOYMENT_FAILURE", "DEPLOYMENT_STOP_ON_ALARM")
} | ConvertTo-Json

$utf8SinBom = New-Object System.Text.UTF8Encoding $false
$alarmConfigFile = Join-Path $env:TEMP "alarm-config-$ServiceName.json"
$autoRollbackFile = Join-Path $env:TEMP "auto-rollback-$ServiceName.json"
[System.IO.File]::WriteAllText($alarmConfigFile, $alarmConfigObj, $utf8SinBom)
[System.IO.File]::WriteAllText($autoRollbackFile, $autoRollbackObj, $utf8SinBom)

if (-not $dgExists) {
  aws deploy create-deployment-group `
    --application-name $AppName `
    --deployment-group-name $DgName `
    --service-role-arn $RoleArn `
    --deployment-config-name $DeploymentConfig `
    --deployment-style "deploymentType=BLUE_GREEN,deploymentOption=WITH_TRAFFIC_CONTROL" `
    --alarm-configuration "file://$alarmConfigFile" `
    --auto-rollback-configuration "file://$autoRollbackFile" `
    --region $Region
  if ($LASTEXITCODE -ne 0) { throw "Falló la creación del Deployment Group." }
  Write-Host "  Deployment Group '$DgName' creado (config: $DeploymentConfig)." -ForegroundColor Green
} else {
  Write-Host "  Ya existía, se reutiliza." -ForegroundColor Green
}
Remove-Item $alarmConfigFile, $autoRollbackFile -ErrorAction SilentlyContinue

# ---------------------------------------------------------
# 4. Resumen
# ---------------------------------------------------------
Write-Host "`n[4/4] Listo." -ForegroundColor Green
Write-Host "`n=== Resumen ===" -ForegroundColor Cyan
Write-Host "  Rol CodeDeploy:      $RoleArn"
Write-Host "  Application:         $AppName"
Write-Host "  Deployment Group:    $DgName"
Write-Host "  Config de trafico:   $DeploymentConfig (10% -> espera 5 min -> 100%)"
Write-Host "  Alarmas conectadas:  $ServiceName-canary-errors, $ServiceName-canary-latency"
Write-Host "`nSiguiente paso: usar deploy-canary.ps1 para hacer un despliegue real de prueba."