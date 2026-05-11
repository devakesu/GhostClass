package com.devakesu.apps.ghostclass

import android.os.Debug
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.devakesu.apps.ghostclass/security"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        
        // Setup Security MethodChannel
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "isDebuggerAttached" -> {
                    val attached = Debug.isDebuggerConnected() || Debug.waitingForDebugger()
                    result.success(attached)
                }
                "setSecureScreen" -> {
                    val enabled = call.argument<Boolean>("enabled") ?: false
                    if (enabled) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                    }
                    result.success(null)
                }
                "exitApp" -> {
                    finishAffinity()
                    System.exit(0)
                }
                "isWindowObscured" -> {
                    result.success(false) 
                }
                else -> {
                    result.notImplemented()
                }
            }
        }
    }
}
