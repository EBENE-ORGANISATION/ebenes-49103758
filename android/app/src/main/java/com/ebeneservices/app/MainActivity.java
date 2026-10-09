package com.ebeneservices.app;

import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Écran de démarrage aux couleurs Ébène Suite (thème AppTheme.NoActionBarLaunch),
        // identique sur toutes les versions d'Android ; doit précéder super.onCreate().
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        // Si Android arrête le moteur d'affichage (mémoire saturée, mise à jour de
        // WebView…), l'application était fermée d'un coup. On relance l'écran à la place.
        if (bridge != null) {
            bridge.addWebViewListener(new WebViewListener() {
                @Override
                public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                    // Android exige de détruire la WebView dont le moteur s'est arrêté
                    if (view.getParent() instanceof ViewGroup) {
                        ((ViewGroup) view.getParent()).removeView(view);
                    }
                    view.destroy();
                    recreate();
                    return true;
                }
            });
        }
    }
}
