package com.gestionhotel.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;

@CapacitorPlugin(name = "VoiceInput")
public class VoiceInputPlugin extends Plugin {
    private boolean listening = false;

    @PluginMethod()
    public void start(PluginCall call) {
        if (listening) {
            call.reject("Ya hay un dictado en curso.", "DICTADO_EN_CURSO");
            return;
        }
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "es-AR");
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Dictá el pedido de reserva. Podés revisarlo antes de enviarlo.");
        if (intent.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("No hay un servicio de dictado instalado.", "DICTADO_NO_DISPONIBLE");
            return;
        }
        listening = true;
        try {
            startActivityForResult(call, intent, "dictationResult");
        } catch (ActivityNotFoundException error) {
            listening = false;
            call.reject("No hay un servicio de dictado disponible.", "DICTADO_NO_DISPONIBLE", error);
        } catch (SecurityException error) {
            listening = false;
            call.reject("El sistema no permitió iniciar el dictado.", "not-allowed", error);
        } catch (Exception error) {
            listening = false;
            call.reject("No se pudo iniciar el dictado.", "DICTADO_FALLIDO", error);
        }
    }

    @ActivityCallback
    private void dictationResult(PluginCall call, ActivityResult result) {
        listening = false;
        if (call == null) return;
        int resultCode = result.getResultCode();
        if (resultCode != Activity.RESULT_OK && resultCode != Activity.RESULT_CANCELED) {
            String code = resultCode == RecognizerIntent.RESULT_NETWORK_ERROR ? "network"
                : resultCode == RecognizerIntent.RESULT_AUDIO_ERROR ? "audio-capture"
                : resultCode == RecognizerIntent.RESULT_NO_MATCH ? "no-speech" : "DICTADO_FALLIDO";
            call.reject("El servicio del sistema no pudo completar el dictado.", code);
            return;
        }
        JSObject response = new JSObject();
        Intent data = result.getData();
        boolean cancelled = result.getResultCode() != Activity.RESULT_OK;
        ArrayList<String> matches = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        String text = !cancelled && matches != null && !matches.isEmpty() ? matches.get(0) : "";
        if (!cancelled && (text == null || text.trim().isEmpty())) {
            call.reject("No se detectó voz.", "no-speech");
            return;
        }
        response.put("text", text == null ? "" : text);
        response.put("cancelled", cancelled);
        call.resolve(response);
    }
}
