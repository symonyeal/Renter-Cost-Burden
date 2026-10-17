param([int]$Port = 8765)
$taskPython = Join-Path $env:LOCALAPPDATA 'Python\pythoncore-3.14-64\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { $taskPython = 'python' }
Write-Host "The Prosperity Gap: http://localhost:$Port"
& $taskPython -m http.server $Port --bind 127.0.0.1 --directory (Join-Path $PSScriptRoot 'site')
