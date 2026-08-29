<#
.SYNOPSIS
  Crea (o reutiliza) un API Gateway HTTP y conecta las 4 Lambdas del
  sistema con las rutas exactas que pide el enunciado del taller.

.EJEMPLO
  .\setup-api-gateway.ps1

.NOTAS
  - Corre este script desde la carpeta "infra/" o cualquier carpeta,
    no depende de rutas relativas a servicios.
  - Es seguro volver a correrlo: detecta recursos existentes y los
    reutiliza en vez de duplicarlos.
  - El CORS queda abierto ("*") por defecto para que puedas probarlo
    de inmediato desde cualquier origen mientras desarrollas. ANTES DE
    LA ENTREGA FINAL, hay que restringirlo al dominio real de Vercel
    (ver el bloque de CORS al final de este script) — el enunciado pide
    explícitamente "políticas restrictivas para el dominio en Vercel".
#>

param(
  [string]$AwsAccountId = "185658217743",
  [string]$Region = "us-east-1",
  [string]$ApiName = "emergencias-api",
  [string]$StageName = "prod"
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

# ---------------------------------------------------------
# Definición de rutas: cada una apunta a una de las 4 Lambdas.
# Nota que "despachos" tiene 2 rutas distintas hacia LA MISMA Lambda
# (dispatch-assignment ya sabe distinguir POST de PATCH internamente).
# ---------------------------------------------------------
$rutas = @(
  @{ Metodo = "POST";  Ruta = "/v1/emergencias";               Funcion = "intake-triage" }
  @{ Metodo = "GET";   Ruta = "/v1/emergencias/zona/{ciudad}";  Funcion = "geospatial-aggregation" }
  @{ Metodo = "POST";  Ruta = "/v1/despachos";                  Funcion = "dispatch-assignment" }
  @{ Metodo = "PATCH"; Ruta = "/v1/despachos/{id}";              Funcion = "dispatch-assignment" }
  @{ Metodo = "POST";  Ruta = "/v1/notificaciones";              Funcion = "notification-broadcast" }
)

Write-Host "`n=== Configurando API Gateway: $ApiName ===" -ForegroundColor Cyan

# ---------------------------------------------------------
# 1. Crear o reutilizar el API HTTP
# ---------------------------------------------------------
Write-Host "`n[1/5] Verificando API..." -ForegroundColor Yellow
$existingApis = aws apigatewayv2 get-apis --region $Region --output json | ConvertFrom-Json
$api = $existingApis.Items | Where-Object { $_.Name -eq $ApiName }

if (-not $api) {
  $apiJson = aws apigatewayv2 create-api `
    --name $ApiName `
    --protocol-type HTTP `
    --region $Region `
    --output json
  if ($LASTEXITCODE -ne 0 -or -not $apiJson) { throw "No se pudo crear el API. Revisa los permisos IAM de tu usuario (necesita AmazonAPIGatewayAdministrator)." }
  $api = $apiJson | ConvertFrom-Json
  Write-Host "  API creada: $($api.ApiId)" -ForegroundColor Green
} else {
  Write-Host "  Ya existía, se reutiliza: $($api.ApiId)" -ForegroundColor Green
}
$ApiId = $api.ApiId
if (-not $ApiId) { throw "No se obtuvo un ApiId válido. Deteniendo para evitar errores en cascada." }

# ---------------------------------------------------------
# 2. Crear una integración por cada Lambda ÚNICA usada en las rutas
#    (dispatch-assignment se reutiliza para 2 rutas distintas)
# ---------------------------------------------------------
Write-Host "`n[2/5] Configurando integraciones con Lambda..." -ForegroundColor Yellow
$integraciones = @{}  # nombre-funcion -> IntegrationId

$funcionesUnicas = $rutas.Funcion | Select-Object -Unique
foreach ($fn in $funcionesUnicas) {
  $lambdaArn = "arn:aws:lambda:${Region}:${AwsAccountId}:function:${fn}"

  $existingInts = aws apigatewayv2 get-integrations --api-id $ApiId --region $Region --output json | ConvertFrom-Json
  $integ = $existingInts.Items | Where-Object { $_.IntegrationUri -eq $lambdaArn }

  if (-not $integ) {
    $integJson = aws apigatewayv2 create-integration `
      --api-id $ApiId `
      --integration-type AWS_PROXY `
      --integration-uri $lambdaArn `
      --payload-format-version "2.0" `
      --region $Region `
      --output json
    $integ = $integJson | ConvertFrom-Json
    Write-Host "  Integración creada para '$fn'." -ForegroundColor Green
  } else {
    Write-Host "  Integración ya existía para '$fn'." -ForegroundColor Green
  }
  $integraciones[$fn] = $integ.IntegrationId

  # Dar permiso a API Gateway para invocar esta Lambda. El SourceArn
  # necesita 3 comodines (etapa/método/ruta) para HTTP API — con solo 2
  # el permiso queda mal formado y API Gateway devuelve "Internal Server
  # Error" al invocar, aunque el comando parezca haber funcionado bien.
  $statementId = "apigateway-invoke-$fn"
  try {
    aws lambda remove-permission --function-name $fn --statement-id $statementId --region $Region 2>$null | Out-Null
  } catch {
    # No existía, no pasa nada.
  }
  aws lambda add-permission `
    --function-name $fn `
    --statement-id $statementId `
    --action "lambda:InvokeFunction" `
    --principal apigateway.amazonaws.com `
    --source-arn "arn:aws:execute-api:${Region}:${AwsAccountId}:${ApiId}/*/*/*" `
    --region $Region | Out-Null
}

# ---------------------------------------------------------
# 3. Crear las rutas (o reutilizarlas si ya existen)
# ---------------------------------------------------------
Write-Host "`n[3/5] Configurando rutas..." -ForegroundColor Yellow
$existingRoutes = aws apigatewayv2 get-routes --api-id $ApiId --region $Region --output json | ConvertFrom-Json

foreach ($r in $rutas) {
  $routeKey = "$($r.Metodo) $($r.Ruta)"
  $yaExiste = $existingRoutes.Items | Where-Object { $_.RouteKey -eq $routeKey }

  if (-not $yaExiste) {
    $integrationId = $integraciones[$r.Funcion]
    aws apigatewayv2 create-route `
      --api-id $ApiId `
      --route-key $routeKey `
      --target "integrations/$integrationId" `
      --region $Region | Out-Null
    Write-Host "  Ruta creada: $routeKey -> $($r.Funcion)" -ForegroundColor Green
  } else {
    Write-Host "  Ruta ya existía: $routeKey" -ForegroundColor Green
  }
}

# ---------------------------------------------------------
# 4. Crear/actualizar el stage "prod" con auto-deploy y throttling
# ---------------------------------------------------------
Write-Host "`n[4/5] Configurando stage '$StageName'..." -ForegroundColor Yellow
$existingStages = aws apigatewayv2 get-stages --api-id $ApiId --region $Region --output json | ConvertFrom-Json
$stage = $existingStages.Items | Where-Object { $_.StageName -eq $StageName }

if (-not $stage) {
  aws apigatewayv2 create-stage `
    --api-id $ApiId `
    --stage-name $StageName `
    --auto-deploy `
    --default-route-settings "ThrottlingBurstLimit=20,ThrottlingRateLimit=10" `
    --region $Region | Out-Null
  Write-Host "  Stage '$StageName' creado (throttling: 10 req/s, ráfaga 20)." -ForegroundColor Green
} else {
  Write-Host "  Stage '$StageName' ya existía, se reutiliza." -ForegroundColor Green
}

# ---------------------------------------------------------
# 5. CORS — abierto por ahora, restringir antes de la entrega final
# ---------------------------------------------------------
Write-Host "`n[5/5] Configurando CORS (abierto temporalmente)..." -ForegroundColor Yellow
aws apigatewayv2 update-api `
  --api-id $ApiId `
  --cors-configuration "AllowOrigins=*,AllowMethods=GET,POST,PATCH,OPTIONS,AllowHeaders=content-type" `
  --region $Region | Out-Null
Write-Host "  CORS configurado (origen: * -> CAMBIAR antes de la entrega)." -ForegroundColor Yellow

# ---------------------------------------------------------
# Resumen
# ---------------------------------------------------------
$baseUrl = "https://$ApiId.execute-api.$Region.amazonaws.com/$StageName"
Write-Host "`n=== Listo ===" -ForegroundColor Cyan
Write-Host "  API ID:    $ApiId"
Write-Host "  Base URL:  $baseUrl"
Write-Host "`nRutas disponibles:"
foreach ($r in $rutas) {
  Write-Host "  $($r.Metodo.PadRight(6)) $baseUrl$($r.Ruta)"
}
Write-Host "`nProbar con, por ejemplo:"
Write-Host "  Invoke-RestMethod -Uri `"$baseUrl/v1/emergencias/zona/cali`" -Method Get"