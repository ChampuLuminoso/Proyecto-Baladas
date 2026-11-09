@echo off
chcp 65001 >nul
title DJ Jorge Montes - Buscador de links
cd /d "%~dp0.."
echo.
echo  === DJ Jorge Montes: buscador de links ===
echo  Busca en YouTube "artista + cancion". No descarga nada.
echo  Puede cerrar esta ventana cuando quiera: lo avanzado queda guardado.
echo.
where py >nul 2>nul && (set PY=py) || (set PY=python)
%PY% --version >nul 2>nul || (
  echo  Falta Python. Instalelo desde https://www.python.org/downloads/
  echo  IMPORTANTE: marque la casilla "Add python.exe to PATH" al instalar.
  pause
  exit /b
)
echo  Preparando la herramienta yt-dlp (solo tarda la primera vez)...
%PY% -m pip install -q -U yt-dlp
echo.
%PY% herramientas\buscar_links.py %*
echo.
pause
