@echo off
set "taskPython=%LOCALAPPDATA%\Python\pythoncore-3.14-64\python.exe"
if not exist "%taskPython%" set "taskPython=python"
set "taskPort=8765"
if not "%~1"=="" set "taskPort=%~1"
echo The Prosperity Gap: http://localhost:%taskPort%
"%taskPython%" -m http.server %taskPort% --bind 127.0.0.1 --directory "%~dp0site"
