package com.devakesu.apps.ghostclass

import android.os.Bundle
import android.os.Debug
import android.view.MotionEvent
import android.view.WindowManager
import androidx.activity.enableEdgeToEdge
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private val CHANNEL = "com.devakesu.apps.ghostclass/security"
    private var isCurrentWindowObscured = false

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_DOWN) {
            isCurrentWindowObscured = false
        }
        val isObscured = (event.flags and MotionEvent.FLAG_WINDOW_IS_OBSCURED) != 0 ||
                (event.flags and MotionEvent.FLAG_WINDOW_IS_PARTIALLY_OBSCURED) != 0
        if (isObscured) {
            isCurrentWindowObscured = true
        }
        return super.dispatchTouchEvent(event)
    }

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
                    result.success(isCurrentWindowObscured) 
                }
                else -> {
                    result.notImplemented()
                }
            }
        }
    }
}
