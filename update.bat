@echo off
title EBENE Business Suite - Mise a jour
color 1F

echo.
echo ============================================================
echo      EBENE Business Suite - Mise a jour automatique
echo ============================================================
echo.

:: Aller dans le dossier du projet
cd /d C:\Users\Lenovo\Desktop\ebenes

echo [1/7] Recuperation des modifications depuis Lovable...
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

echo [3/7] Compilation de l'application...
call npm run build
if %errorlevel% neq 0 (
    echo ERREUR lors de la compilation.
    pause
    exit /b 1
)
echo OK - Application compilee
echo.

echo [4/7] Synchronisation avec Android...
call npx cap sync
if %errorlevel% neq 0 (
    echo ERREUR lors de la synchronisation Android.
    pause
    exit /b 1
)
echo OK - Android synchronise
echo.

echo [5/7] Generation du fichier .exe Windows...
call npm run electron:build:win
if %errorlevel% neq 0 (
    echo ERREUR lors de la generation du .exe.
    pause
    exit /b 1
)
echo OK - Fichier .exe genere
echo.

echo ============================================================
echo   Voulez-vous publier une nouvelle version ?
echo   (mise a jour automatique pour tous les utilisateurs Windows)
echo ============================================================
echo.
set /p PUBLIER="Publier une nouvelle version ? (O/N) : "

if /i "%PUBLIER%"=="O" (
    echo.
    echo Quelle est la nouvelle version ?
    echo Exemple : 1.0.1 ou 1.1.0 ou 2.0.0
    echo.
    set /p VERSION="Entrez le numero de version : "
    echo.

    echo [6/7] Creation du tag de version v%VERSION%...
    git add .
    git commit -m "Release v%VERSION%"
    if %errorlevel% neq 0 (
        echo Pas de nouveaux fichiers - continuation...
    )
    git tag v%VERSION%
    if %errorlevel% neq 0 (
        echo ERREUR lors de la creation du tag.
        pause
        exit /b 1
    )
    echo OK - Tag v%VERSION% cree
    echo.

    echo [7/7] Publication sur GitHub...
    git push origin main
    git push origin v%VERSION%
    if %errorlevel% neq 0 (
        echo ERREUR lors du push GitHub.
        pause
        exit /b 1
    )
    echo OK - Version v%VERSION% publiee
    echo.

    echo ============================================================
    echo           VERSION v%VERSION% PUBLIEE AVEC SUCCES !
    echo ============================================================
    echo.
    echo  GitHub Actions compile le .exe dans 5-10 minutes.
    echo  Les utilisateurs Windows recevront une notification
    echo  de mise a jour automatiquement.
    echo.

) else (

    echo.
    echo [6/7] Sauvegarde sur GitHub sans publication...
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
    echo  .exe   : dist-electron\EBENE Business Suite Setup 0.0.0.exe
    echo.
    echo  Note : Les utilisateurs Windows ne recevront PAS de
    echo  notification automatique pour cette mise a jour.
    echo  Pour les notifier, relancez le script et choisissez O.
    echo.
)

echo Rappel APK : Android Studio - Build - Generate APKs
echo.
pause
