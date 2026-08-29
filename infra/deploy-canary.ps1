<#
.SYNOPSIS
  Ejecuta un despliegue Canary real: publica la versión actual de la
  Lambda (asumiendo que ya subiste código nuevo) y le pide a CodeDeploy
  que mueva el tráfico gradualmente del alias "prod" hacia esa versión
  nueva, monitoreando las alarmas.

.EJEMPLO
  .\deploy-canary.ps1 -ServiceName "intake-triage"

.NOTAS
  Requiere haber corrido antes setup-canary-alias.ps1,
  setup-canary-alarms.ps1 y setup-codedeploy.ps1 para este servicio.

  IMPORTANTE: este script asume que el código NUEVO ya está en la
  Lambda como $LATEST (por ejemplo, corriste antes
  "aws lambda update-function-code" o volviste a correr
  deploy-service.ps1). Este script solo PUBLICA esa versión y le mueve
  tráfico gradualmente vía CodeDeploy — no construye ni sube ninguna
  imagen.
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$ServiceName,

  [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$AppName = "$ServiceName-app"
$DgName = "$ServiceName-dg"

Write-Host "`n=== Despliegue Canary de '$ServiceName' ===" -ForegroundColor Cyan

# ---------------------------------------------------------
# 1. Ver cuál es la versión ACTUAL del alias "prod" (la "buena" a la
#    que hay que volver si algo sale mal)
# ---------------------------------------------------------
$aliasInfo = aws lambda get-alias --function-name $ServiceName --name prod --region $Region --output json | ConvertFrom-Json
$versionActual = $aliasInfo.FunctionVersion
Write-Host "`n  Versión actual en 'prod': $versionActual" -ForegroundColor Yellow

# ---------------------------------------------------------
# 2. Publicar la NUEVA versión (congela el $LATEST recién subido)
# ---------------------------------------------------------
Write-Host "`n[1/3] Publicando nueva versión..." -ForegroundColor Yellow
$versionJson = aws lambda publish-version --function-name $ServiceName --region $Region --output json
$versionNueva = ($versionJson | ConvertFrom-Json).Version

if ($versionNueva -eq $versionActual) {
  Write-Host "  ADVERTENCIA: la nueva versión ($versionNueva) es igual a la actual." -ForegroundColor Red
  Write-Host "  Esto pasa si no subiste código nuevo antes de correr este script." -ForegroundColor Red
  throw "No hay código nuevo que desplegar. Sube el cambio primero con update-function-code."
}
Write-Host "  Versión nueva publicada: $versionNueva" -ForegroundColor Green

# ---------------------------------------------------------
# 3. Crear el AppSpec que le dice a CodeDeploy: "mueve el alias 'prod'
#    de la versión actual a la nueva, gradualmente"
# ---------------------------------------------------------
Write-Host "`n[2/3] Creando el despliegue en CodeDeploy..." -ForegroundColor Yellow

$appSpecObj = @{
  version = "0.0"
  Resources = @(
    @{
      myLambdaFunction = @{
        Type = "AWS::Lambda::Function"
        Properties = @{
          Name = $ServiceName
          Alias = "prod"
          CurrentVersion = "$versionActual"
          TargetVersion = "$versionNueva"
        }
      }
    }
  )
} | ConvertTo-Json -Depth 10

$revisionObj = @{
  revisionType = "AppSpecContent"
  appSpecContent = @{
    content = $appSpecObj
  }
} | ConvertTo-Json -Depth 10 -Compress

$utf8SinBom = New-Object System.Text.UTF8Encoding $false
$revisionFile = Join-Path $env:TEMP "revision-$ServiceName.json"
[System.IO.File]::WriteAllText($revisionFile, $revisionObj, $utf8SinBom)

$deploymentJson = aws deploy create-deployment `
  --application-name $AppName `
  --deployment-group-name $DgName `
  --revision "file://$revisionFile" `
  --region $Region `
  --output json
if ($LASTEXITCODE -ne 0) { throw "Falló la creación del deployment." }
$deploymentId = ($deploymentJson | ConvertFrom-Json).deploymentId
Remove-Item $revisionFile -ErrorAction SilentlyContinue

Write-Host "  Deployment creado: $deploymentId" -ForegroundColor Green
Write-Host "  De versión $versionActual -> $versionNueva (10% de tráfico, 5 min de observación)" -ForegroundColor Green

# ---------------------------------------------------------
# 4. Monitorear el progreso en vivo
# ---------------------------------------------------------
Write-Host "`n[3/3] Monitoreando el despliegue..." -ForegroundColor Yellow
Write-Host "  Consola: https://$Region.console.aws.amazon.com/codesuite/codedeploy/deployments/$deploymentId?region=$Region`n"

$estado = "Created"
do {
  Start-Sleep -Seconds 10
  $status = aws deploy get-deployment --deployment-id $deploymentId --region $Region --output json | ConvertFrom-Json
  $estado = $status.deploymentInfo.status
  Write-Host "  [$( Get-Date -Format 'HH:mm:ss' )] Estado: $estado" -ForegroundColor Cyan
} while ($estado -in @("Created", "Queued", "InProgress", "Ready", "Baking"))

$colorFinal = if ($estado -eq "Succeeded") { "Green" } else { "Red" }
Write-Host "`n=== Resultado final: $estado ===" -ForegroundColor $colorFinal

if ($estado -eq "Succeeded") {
  Write-Host "  El alias 'prod' ahora apunta 100% a la versión $versionNueva." -ForegroundColor Green
} else {
  Write-Host "  El despliegue se detuvo/revirtió. Verificando versión actual del alias..." -ForegroundColor Yellow
  $aliasInfoFinal = aws lambda get-alias --function-name $ServiceName --name prod --region $Region --output json | ConvertFrom-Json
  Write-Host "  Versión confirmada en 'prod' ahora mismo: $($aliasInfoFinal.FunctionVersion)" -ForegroundColor Yellow
}