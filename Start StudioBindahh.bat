@echo off
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  python serve.py
) else (
  echo Python was not found - opening the app directly instead.
  start "" "%~dp0index.html"
)
