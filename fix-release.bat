@echo off
:: ============================================================
:: fix-release.bat — Répare une release GitHub sans latest.yml
:: Lance ce script UNE FOIS pour corriger la release actuelle.
:: ============================================================
setlocal enabledelayedexpansion
cd /d C:\Users\Lenovo\Desktop\ebenes

:: Lire la version actuelle depuis package.json
for /f "tokens=*" %%i in ('powershell -Command "(Get-Content package.json -Raw | ConvertFrom-Json).version"') do set VERSION=%%i
echo Version actuelle : v%VERSION%
echo.

:: Vérifier que dist-electron\latest.yml existe
if not exist "dist-electron\latest.yml" (
    echo ERREUR : dist-electron\latest.yml introuvable.
    echo Relancez update.bat pour rebuilder d'abord.
    pause
    exit /b 1
)

:: Vérifier que le .exe existe
set EXE_DOT=dist-electron\EBENE.SERVICES.Setup.%VERSION%.exe
set EXE_SRC=dist-electron\EBENE SERVICES Setup %VERSION%.exe
if not exist "%EXE_DOT%" (
    if exist "%EXE_SRC%" (
        copy "%EXE_SRC%" "%EXE_DOT%" >nul
        echo EXE copie avec points.
    ) else (
        echo ERREUR : Setup introuvable dans dist-electron.
        echo Relancez update.bat pour rebuilder d'abord.
        pause
        exit /b 1
    )
)

echo Affichage du latest.yml actuel :
echo ─────────────────────────────────
type "dist-electron\latest.yml"
echo ─────────────────────────────────
echo.

echo Upload de latest.yml + exe dans la release v%VERSION%...
gh release upload v%VERSION% ^
    "%EXE_DOT%" ^
    "dist-electron\latest.yml" ^
    --repo EBENE-ORGANISATION/ebenes-49103758 ^
    --clobber

if %errorlevel% equ 0 (
    echo.
    echo OK - latest.yml et exe uploades dans la release v%VERSION%
    echo Les utilisateurs recevront la notification dans ~1 minute.
) else (
    echo.
    echo ERREUR lors de l'upload. Verifiez :
    echo   gh auth status
    echo   Connexion internet
)

echo.
pause
