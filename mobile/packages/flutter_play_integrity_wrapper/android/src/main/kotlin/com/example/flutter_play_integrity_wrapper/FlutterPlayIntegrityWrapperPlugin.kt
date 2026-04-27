package com.example.flutter_play_integrity_wrapper

import android.content.Context
import androidx.annotation.NonNull
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager
import com.google.android.play.core.integrity.IntegrityServiceException
import com.google.android.play.core.integrity.model.IntegrityErrorCode
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.MethodChannel.MethodCallHandler
import io.flutter.plugin.common.MethodChannel.Result

class FlutterPlayIntegrityWrapperPlugin: FlutterPlugin, MethodCallHandler {
    private lateinit var channel : MethodChannel
    private lateinit var context: Context

    override fun onAttachedToEngine(@NonNull flutterPluginBinding: FlutterPlugin.FlutterPluginBinding) {
        channel = MethodChannel(flutterPluginBinding.binaryMessenger, "flutter_play_integrity_wrapper")
        channel.setMethodCallHandler(this)
        context = flutterPluginBinding.applicationContext
    }

    override fun onMethodCall(@NonNull call: MethodCall, @NonNull result: Result) {
        if (call.method == "requestIntegrityToken") {
            val nonce = call.argument<String>("nonce")
            val projectNumber = call.argument<String>("cloudProjectNumber")

            if (nonce == null || projectNumber == null) {
                result.error("INVALID_ARGS", "Nonce or Cloud Project Number is missing", null)
                return
            }

            requestToken(nonce, projectNumber.toLong(), result)
        } else {
            result.notImplemented()
        }
    }

    private fun requestToken(nonce: String, projectNumber: Long, result: Result) {
        try {
            val integrityManager = IntegrityManagerFactory.create(context)

            val request = com.google.android.play.core.integrity.IntegrityTokenRequest.builder()
                .setCloudProjectNumber(projectNumber)
                .setNonce(nonce)
                .build()

            integrityManager.requestIntegrityToken(request)
                .addOnSuccessListener { response ->
                    result.success(response.token())
                }
                .addOnFailureListener { e ->
                    if (e is IntegrityServiceException) {
                        val errorCode = e.errorCode
                        result.error(
                            "INTEGRITY_ERROR_$errorCode",
                            getErrorText(errorCode),
                            e.message
                        )
                    } else {
                        result.error("INTEGRITY_FAILURE", e.message, null)
                    }
                }
        } catch (e: Exception) {
            result.error("EXCEPTION", e.message, null)
        }
    }

    private fun getErrorText(errorCode: Int): String {
        return when (errorCode) {
            IntegrityErrorCode.API_NOT_AVAILABLE -> "Integrity API is not available."
            IntegrityErrorCode.NETWORK_ERROR -> "No network connection."
            IntegrityErrorCode.PLAY_STORE_NOT_FOUND -> "Play Store not found."
            IntegrityErrorCode.PLAY_STORE_VERSION_OUTDATED -> "Play Store version is outdated."
            IntegrityErrorCode.APP_NOT_INSTALLED -> "App is not installed."
            IntegrityErrorCode.PLAY_SERVICES_NOT_FOUND -> "Play Services not found."
            IntegrityErrorCode.APP_UID_MISMATCH -> "App UID mismatch."
            IntegrityErrorCode.TOO_MANY_REQUESTS -> "Too many requests."
            IntegrityErrorCode.CANNOT_BIND_TO_SERVICE -> "Cannot bind to service."
            IntegrityErrorCode.GOOGLE_SERVER_UNAVAILABLE -> "Google server unavailable."
            IntegrityErrorCode.PLAY_STORE_ACCOUNT_NOT_FOUND -> "Play Store account not found."
            IntegrityErrorCode.CLOUD_PROJECT_NUMBER_IS_INVALID -> "Cloud project number is invalid."
            IntegrityErrorCode.NONCE_IS_NOT_BASE64 -> "Nonce is not Base64."
            IntegrityErrorCode.NONCE_TOO_LONG -> "Nonce is too long."
            IntegrityErrorCode.NONCE_TOO_SHORT -> "Nonce is too short."
            else -> "Unknown error (Code: $errorCode)"
        }
    }

    override fun onDetachedFromEngine(@NonNull binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
    }
}