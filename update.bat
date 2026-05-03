@echo off
setlocal enabledelayedexpansion
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit
)
title EBENE Business Suite - Mise a jour
color 1F

echo.
echo ============================================================
echo      EBENE Business Suite - Mise a jour automatique
echo ============================================================
echo.

:: Aller dans le dossier du projet
cd /d C:\Users\Lenovo\Desktop\ebenes

echo [1/7] Recuperation des modifications depuis GitHub...
git pull
if %errorlevel% neq 0 (
    echo ERREUR lors du git pull. Verifiez votre connexion internet.
    pause
    exit /b 1
)
echo OK - Modifications recuperees
echo.

echo [2/7] Installation des nouvelles dependances...
call npm install
if %errorlevel% neq 0 (
    echo ERREUR lors du npm install.
    pause
    exit /b 1
)
echo OK - Dependances installes
echo.

:: ─── Demander la version AVANT le build ──────────────────────────────────
echo ============================================================
echo   Voulez-vous publier une nouvelle version ?
echo   (mise a jour automatique pour tous les utilisateurs Windows)
echo ============================================================
echo.
set /p PUBLIER="Publier une nouvelle version ? (O/N) : "

if /i "%PUBLIER%"=="O" goto :demander_version
goto :version_actuelle

:demander_version
echo.
echo Quelle est la nouvelle version ?
echo Exemple : 1.0.1 ou 1.1.0 ou 2.0.0
echo.
set /p VERSION="Entrez le numero de version : "
echo.
if "%VERSION%"=="" (
    echo ERREUR : Version non saisie.
    pause
    exit /b 1
)
echo [3/7] Mise a jour de package.json avec la version %VERSION%...
call npm version %VERSION% --no-git-tag-version
if %errorlevel% neq 0 (
    echo ERREUR lors de la mise a jour de la version dans package.json.
    pause
    exit /b 1
)
echo OK - package.json mis a jour : v%VERSION%
echo.
goto :build_start

:version_actuelle
for /f "tokens=*" %%i in ('powershell -Command "(Get-Content package.json -Raw | ConvertFrom-Json).version"') do set VERSION=%%i
echo.
echo Version actuelle : v%VERSION% (pas de changement)
echo.

:build_start

echo [4/7] Compilation de l'application web...
call npm run build
if %errorlevel% neq 0 (
    echo ERREUR lors de la compilation.
    pause
    exit /b 1
)
echo OK - Application compilee
echo.

echo [5/7] Synchronisation avec Android...
call npx cap sync
if %errorlevel% neq 0 (
    echo ERREUR lors de la synchronisation Android.
    pause
    exit /b 1
)
echo OK - Android synchronise
echo.

echo [6/7] Generation du fichier .exe Windows avec la version v%VERSION%...
call npm run electron:build:win
if %errorlevel% neq 0 (
    echo ERREUR lors de la generation du .exe.
    pause
    exit /b 1
)
echo OK - Fichier .exe genere : EBENE Business Suite Setup %VERSION%.exe
echo.

echo Correction des noms de fichiers dans latest.yml...
powershell -Command "$f='dist-electron\latest.yml'; $c=Get-Content $f; ($c | ForEach-Object { if ($_ -match '(path|url):') { $p=$_ -split ': ',2; $p[0]+': '+$p[1].Replace(' ','.') } else { $_ } }) | Set-Content $f -Encoding UTF8"
echo OK - latest.yml corrige (espaces remplaces par des points)
echo.

if /i "%PUBLIER%"=="O" (

    echo [7/7] Publication sur GitHub...
    git add .
    git commit -m "Release v%VERSION%"
    if %errorlevel% neq 0 (
        echo Pas de nouveaux fichiers - continuation...
    )
    git tag v%VERSION%
    if %errorlevel% neq 0 (
        echo ERREUR lors de la creation du tag v%VERSION%.
        pause
        exit /b 1
    )
    git push origin main
    if %errorlevel% neq 0 (
        echo ERREUR lors du push sur GitHub.
        pause
        exit /b 1
    )
    git push origin v%VERSION%
    if %errorlevel% neq 0 (
        echo ERREUR lors du push du tag sur GitHub.
        pause
        exit /b 1
    )
    echo OK - Code pousse sur GitHub avec le tag v%VERSION%
    echo.

    echo Creation de la release GitHub...
    gh release create v%VERSION% ^
        "dist-electron\EBENE Business Suite Setup %VERSION%.exe" ^
        --repo Ennod22/ebenes ^
        --title "v%VERSION%" ^
        --notes "Release v%VERSION% - Mise a jour automatique"
    if %errorlevel% neq 0 (
        echo ERREUR lors de la creation de la release GitHub.
        echo Verifiez que GitHub CLI est installe et authentifie (gh auth login).
        pause
        exit /b 1
    )
    echo OK - Release GitHub v%VERSION% creee
    echo.

    echo ============================================================
    echo           VERSION v%VERSION% PUBLIEE AVEC SUCCES !
    echo ============================================================
    echo.
    echo  GitHub   : https://github.com/Ennod22/ebenes/releases/tag/v%VERSION%
    echo  .exe     : dist-electron\EBENE Business Suite Setup %VERSION%.exe
    echo.
    echo  Les utilisateurs Windows recevront une notification
    echo  de mise a jour automatiquement.
    echo.

) else (

    git add .
    git commit -m "Update %date%"
    git push origin main
    if %errorlevel% neq 0 (
        echo ERREUR lors du push GitHub.
        pause
        exit /b 1
    )
    echo OK - Sauvegarde sur GitHub
    echo.

    echo ============================================================
    echo          MISE A JOUR LOCALE TERMINEE AVEC SUCCES !
    echo ============================================================
    echo.
    echo  .exe     : dist-electron\EBENE Business Suite Setup %VERSION%.exe
    echo.
    echo  Note : Les utilisateurs Windows ne recevront PAS de
    echo  notification automatique pour cette mise a jour.
    echo  Pour les notifier, relancez le script et choisissez O.
    echo.
)

echo Rappel APK : Android Studio - Build - Generate APKs
echo.
pause
