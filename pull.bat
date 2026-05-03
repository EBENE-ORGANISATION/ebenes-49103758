@echo off
cd /d C:\Users\Lenovo\Desktop\ebenes

echo ================================================
echo   EBENE Business Suite - Synchronisation GitHub
echo ================================================
echo.

echo [1/3] Recuperation depuis GitHub...
git config gc.auto 0
git pull
if %errorlevel% neq 0 (
    echo ERREUR lors du pull. Verifiez votre connexion.
    pause
    exit /b 1
)

echo.
echo [2/3] Modifications locales detectees :
git status --short
echo.

set /p COMMIT="Entrez un message de commit (ou ENTER pour ignorer) : "
if "%COMMIT%"=="" goto fin

echo.
echo [3/3] Envoi vers GitHub...
git add .
git commit -m "%COMMIT%"
git push

if %errorlevel% == 0 (
    echo.
    echo ================================================
    echo   OK - Synchronisation complete !
    echo ================================================
) else (
    echo.
    echo ================================================
    echo   ERREUR lors du push.
    echo ================================================
)

:fin
echo.
pause
