<#
.SYNOPSIS
  Prepara una Lambda para despliegues Canary: publica su versión actual,
  crea el alias "prod" apuntando a esa versión (100% del tráfico), y
  actualiza el API Gateway para invocar el ALIAS en vez de $LATEST.

  Este es un paso ÚNICO por microservicio — se corre una sola vez para
  "activar" el patrón Canary. Los despliegues futuros usan un script
  distinto (deploy-canary.ps1) que mueve el tráfico gradualmente entre
  versiones.

.EJEMPLO
  .\setup-canary-alias.ps1 -ServiceName "intake-triage"
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$ServiceName,

  [string]$AwsAccountId = "185658217743",
  [string]$Region = "us-east-1",
  [string]$ApiName = "emergencias-api"
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

Write-Host "`n=== Activando patrón Canary para '$ServiceName' ===" -ForegroundColor Cyan

# ---------------------------------------------------------
# 1. Publicar la versión actual (congela el código de $LATEST)
# ---------------------------------------------------------
Write-Host "`n[1/4] Publicando versión..." -ForegroundColor Yellow
$versionJson = aws lambda publish-version --function-name $ServiceName --region $Region --output json
$version = ($versionJson | ConvertFrom-Json).Version
Write-Host "  Versión publicada: $version" -ForegroundColor Green

# ---------------------------------------------------------
# 2. Crear (o actualizar) el alias "prod" -> 100% en esta versión
# ---------------------------------------------------------
Write-Host "`n[2/4] Configurando alias 'prod'..." -ForegroundColor Yellow
$aliasExists = $null
try {
  $aliasExists = aws lambda get-alias --function-name $ServiceName --name prod --region $Region --output json 2>$null
} catch { $aliasExists = $null }

if (-not $aliasExists) {
  aws lambda create-alias --function-name $ServiceName --name prod --function-version $version --region $Region | Out-Null
  Write-Host "  Alias 'prod' creado -> versión $version (100%)." -ForegroundColor Green
} else {
  aws lambda update-alias --function-name $ServiceName --name prod --function-version $version --region $Region | Out-Null
  Write-Host "  Alias 'prod' actualizado -> versión $version (100%)." -ForegroundColor Green
}

# ---------------------------------------------------------
# 3. Dar permiso a API Gateway para invocar el ALIAS (no solo la función)
# ---------------------------------------------------------
Write-Host "`n[3/4] Actualizando permisos para el alias..." -ForegroundColor Yellow
$existingApis = aws apigatewayv2 get-apis --region $Region --output json | ConvertFrom-Json
$api = $existingApis.Items | Where-Object { $_.Name -eq $ApiName }
if (-not $api) { throw "No se encontró el API '$ApiName'. Corre primero setup-api-gateway.ps1." }
$ApiId = $api.ApiId

$statementId = "apigateway-invoke-$ServiceName-alias"
try {
  aws lambda remove-permission --function-name $ServiceName --qualifier prod --statement-id $statementId --region $Region 2>$null | Out-Null
} catch {}
aws lambda add-permission `
  --function-name $ServiceName `
  --qualifier prod `
  --statement-id $statementId `
  --action "lambda:InvokeFunction" `
  --principal apigateway.amazonaws.com `
  --source-arn "arn:aws:execute-api:${Region}:${AwsAccountId}:${ApiId}/*/*/*" `
  --region $Region | Out-Null
Write-Host "  Permiso otorgado a API Gateway sobre el alias 'prod'." -ForegroundColor Green

# ---------------------------------------------------------
# 4. Redirigir la integración del API Gateway al ALIAS, no a $LATEST
# ---------------------------------------------------------
Write-Host "`n[4/4] Actualizando integración del API Gateway..." -ForegroundColor Yellow
$aliasedArn = "arn:aws:lambda:${Region}:${AwsAccountId}:function:${ServiceName}:prod"

$existingInts = aws apigatewayv2 get-integrations --api-id $ApiId --region $Region --output json | ConvertFrom-Json
$plainArn = "arn:aws:lambda:${Region}:${AwsAccountId}:function:${ServiceName}"
$integ = $existingInts.Items | Where-Object { $_.IntegrationUri -eq $plainArn -or $_.IntegrationUri -eq $aliasedArn }

if (-not $integ) {
  throw "No se encontró una integración existente para '$ServiceName'. Corre primero setup-api-gateway.ps1."
}

aws apigatewayv2 update-integration `
  --api-id $ApiId `
  --integration-id $integ.IntegrationId `
  --integration-uri $aliasedArn `
  --region $Region | Out-Null
Write-Host "  Integración actualizada -> ahora apunta al alias 'prod'." -ForegroundColor Green

Write-Host "`n=== Listo ===" -ForegroundColor Cyan
Write-Host "  Función:  $ServiceName"
Write-Host "  Versión inicial: $version"
Write-Host "  Alias 'prod' -> 100% en versión $version"
Write-Host "  API Gateway ahora invoca: $aliasedArn"