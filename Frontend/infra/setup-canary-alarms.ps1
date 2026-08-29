<#
.SYNOPSIS
  Crea 2 alarmas de CloudWatch para una Lambda con alias "prod":
  errores (5xx / fallos de ejecución) y latencia. CodeDeploy las usa
  durante la ventana canary para decidir si sigue adelante o revierte
  automáticamente el despliegue.

.EJEMPLO
  .\setup-canary-alarms.ps1 -ServiceName "intake-triage"
#>

param(
  [Parameter(Mandatory = $true)]
  [string]$ServiceName,

  [string]$Region = "us-east-1",
  [int]$UmbralErrores = 1,        # más de 1 error en la ventana dispara la alarma
  [int]$UmbralLatenciaMs = 1500,  # el enunciado pide 1500ms como umbral
  [int]$PeriodoSegundos = 60
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

Write-Host "`n=== Creando alarmas CloudWatch para '$ServiceName' ===" -ForegroundColor Cyan

# Las dimensiones se escriben a un archivo temporal en vez de pasarse
# como string inline: Windows PowerShell tiene un problema conocido
# donde las comillas dobles dentro de un argumento se pierden al armar
# la línea de comandos para un programa externo, dejando el JSON roto.
$dimensionesJson = @(
  @{ Name = "FunctionName"; Value = $ServiceName },
  @{ Name = "Resource"; Value = "${ServiceName}:prod" }
) | ConvertTo-Json

$dimensionesFile = Join-Path $env:TEMP "dimensiones-$ServiceName.json"
# Se escribe sin BOM explícitamente: "Set-Content -Encoding UTF8" en
# Windows PowerShell 5.1 agrega un BOM al inicio del archivo, y el
# parser de JSON de AWS CLI no lo tolera (lo interpreta como un
# carácter inválido antes del "[").
$utf8SinBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($dimensionesFile, $dimensionesJson, $utf8SinBom)

# ---------------------------------------------------------
# Alarma 1: Errores de la función (fallos de ejecución, excepciones no
# controladas, timeouts) medidos SOLO sobre el alias "prod" — así la
# alarma reacciona específicamente a lo que le pasa al tráfico en
# producción, no a pruebas manuales contra $LATEST.
# ---------------------------------------------------------
$alarmaErroresName = "$ServiceName-canary-errors"
Write-Host "`n[1/2] Creando alarma de errores: $alarmaErroresName..." -ForegroundColor Yellow
aws cloudwatch put-metric-alarm `
  --alarm-name $alarmaErroresName `
  --namespace "AWS/Lambda" `
  --metric-name "Errors" `
  --dimensions "file://$dimensionesFile" `
  --statistic "Sum" `
  --period $PeriodoSegundos `
  --evaluation-periods 1 `
  --threshold $UmbralErrores `
  --comparison-operator "GreaterThanOrEqualToThreshold" `
  --treat-missing-data "notBreaching" `
  --region $Region
if ($LASTEXITCODE -ne 0) { throw "Falló la creación de la alarma de errores." }
Write-Host "  Alarma creada (dispara con >= $UmbralErrores error(es) en $PeriodoSegundos seg)." -ForegroundColor Green

# ---------------------------------------------------------
# Alarma 2: Latencia (Duration) — el enunciado pide explícitamente
# vigilar Latency > 1500ms.
# ---------------------------------------------------------
$alarmaLatenciaName = "$ServiceName-canary-latency"
Write-Host "`n[2/2] Creando alarma de latencia: $alarmaLatenciaName..." -ForegroundColor Yellow
aws cloudwatch put-metric-alarm `
  --alarm-name $alarmaLatenciaName `
  --namespace "AWS/Lambda" `
  --metric-name "Duration" `
  --dimensions "file://$dimensionesFile" `
  --statistic "Average" `
  --period $PeriodoSegundos `
  --evaluation-periods 1 `
  --threshold $UmbralLatenciaMs `
  --comparison-operator "GreaterThanThreshold" `
  --treat-missing-data "notBreaching" `
  --region $Region
if ($LASTEXITCODE -ne 0) { throw "Falló la creación de la alarma de latencia." }
Write-Host "  Alarma creada (dispara con latencia promedio > ${UmbralLatenciaMs}ms)." -ForegroundColor Green

Remove-Item $dimensionesFile -ErrorAction SilentlyContinue

Write-Host "`n=== Listo ===" -ForegroundColor Cyan
Write-Host "  $alarmaErroresName"
Write-Host "  $alarmaLatenciaName"
Write-Host "`nVerifica en la consola: CloudWatch -> Alarms -> deberían aparecer 'OK' (sin datos de error todavía es normal)."