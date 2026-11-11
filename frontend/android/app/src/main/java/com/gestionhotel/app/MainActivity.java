package com.gestionhotel.app;

import android.os.Bundle;
import android.webkit.CookieManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VoiceInputPlugin.class);
        super.onCreate(savedInstanceState);
        if (getBridge() != null && getBridge().getWebView() != null) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(getBridge().getWebView(), true);
        }
    }
}
