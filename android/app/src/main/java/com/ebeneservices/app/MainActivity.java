package com.ebeneservices.app;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Écran de démarrage aux couleurs Ébène Suite (thème AppTheme.NoActionBarLaunch),
        // identique sur toutes les versions d'Android ; doit précéder super.onCreate().
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
    }
}
