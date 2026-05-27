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

cd /d C:\Users\Lenovo\Desktop\ebenes

:: ============================================================
:: [1/7] Git pull
:: ============================================================
echo [1/7] Recuperation des modifications depuis GitHub...
git config gc.auto 0
git pull
if %errorlevel% neq 0 (
    echo ERREUR lors du git pull. Verifiez votre connexion internet.
    pause
    exit /b 1
)
echo OK - Modifications recuperees
echo.

:: ============================================================
:: [2/7] npm install
:: ============================================================
echo [2/7] Installation des nouvelles dependances...
call npm install
if %errorlevel% neq 0 (
    echo ERREUR lors du npm install.
    pause
    exit /b 1
)
echo OK - Dependances installes
echo.

:: ============================================================
:: Demander si nouvelle version
:: ============================================================
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
call npm version %VERSION% --no-git-tag-version --allow-same-version
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

:: ============================================================
:build_start
:: ============================================================

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

:: ============================================================
:: [6/7] Build electron
:: ============================================================
echo [6/7] Generation du fichier Setup Windows v%VERSION%...

:: Fermer l'app si elle tourne
taskkill /f /im "EBENE SERVICES.exe" >nul 2>&1

:: Nettoyer l'ancien build decompresse
if exist "dist-electron\win-unpacked" rmdir /s /q "dist-electron\win-unpacked"

:: Vider le cache rcedit (cause principale de "Unable to commit changes")
if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"

:: Exclure les dossiers de build de Windows Defender
powershell -Command "Add-MpPreference -ExclusionPath 'C:\Users\Lenovo\Desktop\ebenes\dist-electron'" >nul 2>&1
powershell -Command "Add-MpPreference -ExclusionPath '%LOCALAPPDATA%\electron-builder'" >nul 2>&1

:: Desactiver la protection temps reel pendant le build
echo Desactivation temporaire de Windows Defender...
powershell -Command "Set-MpPreference -DisableRealtimeMonitoring $true" >nul 2>&1

call npm run electron:build:win
set BUILD_ERR=%errorlevel%

:: Reactivation immediate apres le build
echo Reactivation de Windows Defender...
powershell -Command "Set-MpPreference -DisableRealtimeMonitoring $false" >nul 2>&1

if %BUILD_ERR% neq 0 (
    echo ERREUR lors de la generation du Setup Windows.
    pause
    exit /b 1
)
echo OK - Setup Windows genere : EBENE SERVICES Setup %VERSION%.exe
echo.

:: Regenerer latest.yml avec les noms de fichiers en points (GitHub remplace les espaces par des points)
:: Electron-builder genere le yml avec des espaces ; on extrait sha512+size par regex et on recree un YAML propre.
echo Regeneration de latest.yml...
powershell -Command ^
  "$raw = Get-Content 'dist-electron\latest.yml' -Raw;" ^
  "$sha = if ($raw -match '(?m)^sha512:\s*(\S+)') { $Matches[1] } else { '' };" ^
  "$sz  = if ($raw -match '(?m)size:\s*(\d+)')    { $Matches[1] } else { '0' };" ^
  "$fn  = 'EBENE.SERVICES.Setup.%VERSION%.exe';" ^
  "$dt  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ');" ^
  "$out = 'version: %VERSION%' + [char]10 + 'files:' + [char]10 + '  - url: ' + $fn + [char]10 + '    sha512: ' + $sha + [char]10 + '    size: ' + $sz + [char]10 + 'path: ' + $fn + [char]10 + 'sha512: ' + $sha + [char]10 + 'releaseDate: ' + [char]39 + $dt + [char]39 + [char]10;" ^
  "Set-Content 'dist-electron\latest.yml' $out -NoNewline -Encoding utf8"
if %errorlevel% neq 0 (
    echo ERREUR lors de la regeneration de latest.yml.
    pause
    exit /b 1
)
echo OK - latest.yml regenere
echo.

:: ============================================================
:: Branche publication
:: ============================================================
if /i "%PUBLIER%"=="O" goto :publier
goto :pas_publier

:: ============================================================
:publier
:: ============================================================
echo [7/7] Publication sur GitHub...
git add -A
git commit -m "Release v%VERSION%"
if %errorlevel% neq 0 echo Pas de nouveaux fichiers - continuation...

:: Tag : supprimer l'ancien tag local s'il existe (cas de retry)
git tag -d v%VERSION% >nul 2>&1
git tag v%VERSION%

git push origin main
if %errorlevel% neq 0 (
    echo ERREUR lors du push sur GitHub.
    pause
    exit /b 1
)

:: Forcer le push du tag (cas de retry ou tag deja present)
git push origin v%VERSION% --force
if %errorlevel% neq 0 (
    echo ERREUR lors du push du tag sur GitHub.
    pause
    exit /b 1
)
echo OK - Code pousse sur GitHub avec le tag v%VERSION%
echo.

:: ─────────────────────────────────────────────────────────────
:: Preparer les fichiers a uploader
::   - .exe renomme avec des POINTS (URL stable, correspond a latest.yml)
::   - latest.yml OBLIGATOIRE pour que le client se mette a jour
:: ─────────────────────────────────────────────────────────────
set EXE_SRC=dist-electron\EBENE SERVICES Setup %VERSION%.exe
set EXE_DOT=dist-electron\EBENE.SERVICES.Setup.%VERSION%.exe

if not exist "%EXE_SRC%" (
    echo ERREUR : fichier Setup introuvable : %EXE_SRC%
    pause
    exit /b 1
)
if exist "%EXE_DOT%" del /f /q "%EXE_DOT%"
copy "%EXE_SRC%" "%EXE_DOT%" >nul

:: Timeout plus long pour gh (secondes)
set GH_TIMEOUT=120

:: ─────────────────────────────────────────────────────────────
:: Upload avec retry automatique (3 tentatives, 20s d'attente)
:: ─────────────────────────────────────────────────────────────
set TENTATIVE=0

:retry_release
set /a TENTATIVE+=1
echo Tentative !TENTATIVE!/3 - Creation/mise a jour de la release GitHub...

gh release create v%VERSION% ^
    "%EXE_DOT%" ^
    "dist-electron\latest.yml" ^
    --repo EBENE-ORGANISATION/ebenes-49103758 ^
    --title "v%VERSION%" ^
    --notes "Release v%VERSION% - Mise a jour automatique"

if %errorlevel% equ 0 goto :release_creee

:: Release deja existante : remplacer les assets
echo Release existante detectee - remplacement des fichiers...
gh release upload v%VERSION% ^
    "%EXE_DOT%" ^
    "dist-electron\latest.yml" ^
    --repo EBENE-ORGANISATION/ebenes-49103758 ^
    --clobber

if %errorlevel% equ 0 (
    echo OK - Fichiers mis a jour dans la release v%VERSION%
    goto :release_done
)

:: Echec reseau - nouvelle tentative si possible
if !TENTATIVE! lss 3 (
    echo.
    echo [RESEAU] Echec tentative !TENTATIVE!/3. Attente 20 secondes...
    timeout /t 20 /nobreak >nul
    goto :retry_release
)

:: 3 tentatives epuisees
echo.
echo ERREUR : 3 tentatives d'upload echouees ^(timeout reseau^).
echo.
echo Solutions :
echo   1. Verifiez votre connexion internet et relancez update.bat
echo   2. Uploadez manuellement sur : https://github.com/EBENE-ORGANISATION/ebenes-49103758/releases/tag/v%VERSION%
echo      Fichiers a uploader :
echo        - %EXE_DOT%
echo        - dist-electron\latest.yml
echo   3. Verifiez : gh auth status
echo.
pause
exit /b 1

:release_creee
echo OK - Release GitHub v%VERSION% creee

:release_done
echo.
echo ============================================================
echo           VERSION v%VERSION% PUBLIEE AVEC SUCCES !
echo ============================================================
echo.
echo  GitHub  : https://github.com/EBENE-ORGANISATION/ebenes-49103758/releases/tag/v%VERSION%
echo  Setup   : %EXE_DOT%
echo  yml     : dist-electron\latest.yml
echo.
echo  Les utilisateurs Windows recevront la mise a jour automatiquement.
echo.
goto :fin_script

:: ============================================================
:pas_publier
:: ============================================================
git add -A
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
echo  Setup   : EBENE SERVICES Setup %VERSION%.exe
echo.
echo  Note : Les utilisateurs Windows ne recevront PAS de
echo  notification automatique pour cette mise a jour.
echo  Pour les notifier, relancez le script et choisissez O.
echo.

:: ============================================================
:fin_script
:: ============================================================
echo Rappel APK : Android Studio - Build - Generate APKs
echo.
pause
