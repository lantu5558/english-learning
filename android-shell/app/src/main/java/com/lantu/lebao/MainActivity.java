package com.lantu.lebao;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebChromeClient.CustomViewCallback;
import android.webkit.WebChromeClient.FileChooserParams;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * 乐宝学习 · Android 壳
 *
 * 设计原则：这个壳只负责打开远程网址，不把网页打包进来。
 * 所以以后改功能、改样式、修 bug 只要改网站就行，APP 不用重新打包。
 * 只有改图标 / APP 名字 / 权限 / 屏幕方向 / UA 才需要重新打一次包。
 */
public class MainActivity extends AppCompatActivity {

    /** 网站地址。换域名时改这里，然后重新打包 */
    private static final String HOME_URL = "https://lantu5558.github.io/english-learning/";

    /**
     * 伪装成普通 Chrome。
     * 华为自带浏览器的 UA 会被一些视频站点（尤其是 B站播放器）区别对待，
     * 换成标准 Chrome UA 后兼容性明显更好。这是解决 B站播不了的第一招。
     */
    private static final String CHROME_UA =
            "Mozilla/5.0 (Linux; Android 12; Tablet) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";

    private static final int REQ_PERMISSION = 1001;
    private static final int REQ_FILE_CHOOSER = 1002;
    private static final int REQ_CAMERA = 1003;

    private WebView web;
    private SwipeRefreshLayout swipe;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri cameraPhotoUri;

    // ---- 全屏视频相关 ----
    /** 全屏时 WebView 交出来的那块画面 */
    private View customView;
    private CustomViewCallback customCallback;
    private FrameLayout fullscreenContainer;
    private int originalOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR;
    private int originalSystemUiVisibility = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        swipe = findViewById(R.id.swipe);
        web = findViewById(R.id.web);
        fullscreenContainer = findViewById(R.id.fullscreen_container);

        configWebSettings();
        configClients();
        askPermissions();

        swipe.setColorSchemeResources(android.R.color.holo_blue_bright);
        swipe.setOnRefreshListener(() -> web.reload());

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(HOME_URL);
        }
    }

    // ---------- WebView 设置 ----------
    private void configWebSettings() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);        // localStorage 存数据，必须开
        s.setDatabaseEnabled(true);

        // 关键：不要求"用户点一下才允许播放"，否则视频/音频会自动被拦
        s.setMediaPlaybackRequiresUserGesture(false);

        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(CHROME_UA);
    }

    private void configClients() {
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme() == null ? "" : uri.getScheme();
                // 拨号、邮件这类交给系统
                if ("tel".equals(scheme) || "mailto".equals(scheme) || "sms".equals(scheme)) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri));
                    } catch (Exception ignored) {
                    }
                    return true;
                }
                // 其余一律留在 APP 里打开。浏览器是要在平板上禁掉的，
                // 任何链接都不能跳出去，否则孩子就跑回浏览器了。
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                swipe.setRefreshing(false);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request != null && !request.isForMainFrame()) return;
                swipe.setRefreshing(false);
                Toast.makeText(MainActivity.this, "网络没连上，下拉可以重试", Toast.LENGTH_LONG).show();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {

            /**
             * 网页里点「录音打卡」时，系统会走这里。
             * 不重写这个方法的话，getUserMedia 直接失败，录音功能就废了。
             */
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    try {
                        request.grant(request.getResources());
                    } catch (Exception e) {
                        request.deny();
                    }
                });
            }

            /**
             * 视频全屏的关键。
             * 网页里（包括 B站这类 iframe 播放器）一点全屏，WebView 就把画面交给这里。
             * 不重写这个方法，点全屏就是「没反应、还是原来那么大一格」——
             * 因为没人接管那块画面，WebView 只能默默丢弃这次请求。
             */
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    // 已经在全屏了，直接结束这次请求，避免叠加两层
                    callback.onCustomViewHidden();
                    return;
                }
                if (view == null) return;

                customView = view;
                customCallback = callback;
                originalOrientation = getRequestedOrientation();
                originalSystemUiVisibility = getWindow().getDecorView().getSystemUiVisibility();

                swipe.setEnabled(false);                       // 全屏时关掉下拉刷新，误触会打断视频
                fullscreenContainer.setVisibility(View.VISIBLE);
                fullscreenContainer.addView(view, new FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT));

                applyFullscreen(true);
                // 视频通常是横的，转过去；家长想竖着看也转得回来（传感器跟随）
                setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
                Toast.makeText(MainActivity.this, "已进入全屏，按返回键退出", Toast.LENGTH_SHORT).show();
            }

            /**
             * 网页（或播放器）自己退出全屏时走这里，转交给下面的 exitFullscreen 统一收尾。
             */
            @Override
            public void onHideCustomView() {
                exitFullscreen();
            }

            /**
             * 网页里的 <input type="file"> 走这里：
             * 拍照打卡、作业上传图片都靠它。不实现的话点了没反应。
             */
            @Override
            public boolean onShowFileChooser(WebView view,
                                             ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                filePathCallback = callback;
                if (params != null && params.isCaptureEnabled()) {
                    openCamera();           // 写了 capture，直接开相机
                } else {
                    openPicker(params);     // 否则给「拍照 or 从相册选」
                }
                return true;
            }

            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                swipe.setRefreshing(newProgress < 100);
            }
        });
    }

    /**
     * 收起全屏，把一切恢复原样。
     * 放在 Activity 这一层（而不是 WebChromeClient 内部）是为了让
     * 返回键、切后台、销毁这几种情况都能调到同一套收尾逻辑。
     */
    private void exitFullscreen() {
        if (customView == null) return;

        fullscreenContainer.removeView(customView);
        customView = null;
        fullscreenContainer.setVisibility(View.GONE);

        applyFullscreen(false);
        swipe.setEnabled(true);
        setRequestedOrientation(originalOrientation);

        if (customCallback != null) {
            customCallback.onCustomViewHidden();       // 必须回调，否则 WebView 会卡在全屏状态
            customCallback = null;
        }
    }

    /**
     * 全屏时：隐藏状态栏和导航栏（沉浸式），并让屏幕一直亮着。
     * 看视频看到一半熄屏、或者误触到导航栏退出去，对孩子来说很烦。
     */
    private void applyFullscreen(boolean on) {
        View decor = getWindow().getDecorView();
        if (on) {
            int flags = View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
            decor.setSystemUiVisibility(flags);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (getSupportActionBar() != null) getSupportActionBar().hide();
        } else {
            decor.setSystemUiVisibility(originalSystemUiVisibility);
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }
    }

    // ---------- 权限 ----------
    private void askPermissions() {
        List<String> need = new ArrayList<>();
        if (!has(Manifest.permission.RECORD_AUDIO)) need.add(Manifest.permission.RECORD_AUDIO);
        if (!has(Manifest.permission.CAMERA)) need.add(Manifest.permission.CAMERA);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (!has(Manifest.permission.READ_MEDIA_IMAGES)) need.add(Manifest.permission.READ_MEDIA_IMAGES);
        } else {
            if (!has(Manifest.permission.READ_EXTERNAL_STORAGE)) need.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }
        if (!need.isEmpty()) {
            ActivityCompat.requestPermissions(this, need.toArray(new String[0]), REQ_PERMISSION);
        }
    }

    private boolean has(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMISSION) {
            for (String p : permissions) {
                if (Manifest.permission.RECORD_AUDIO.equals(p)) {
                    boolean ok = has(Manifest.permission.RECORD_AUDIO);
                    Toast.makeText(this, ok ? "麦克风已授权，可以录音打卡" : "麦克风被拒绝，朗读打卡会录不了音",
                            Toast.LENGTH_LONG).show();
                }
            }
        }
    }

    // ---------- 拍照 / 选图 ----------
    private void openCamera() {
        cameraPhotoUri = createPhotoUri();
        if (cameraPhotoUri == null) {
            Toast.makeText(this, "无法创建照片文件", Toast.LENGTH_SHORT).show();
            cancelFileCallback();
            return;
        }
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraPhotoUri);
        camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            startActivityForResult(camera, REQ_CAMERA);
        } catch (Exception e) {
            Toast.makeText(this, "这台设备没有相机应用", Toast.LENGTH_SHORT).show();
            cancelFileCallback();
        }
    }

    private void openPicker(FileChooserParams params) {
        Intent content = new Intent(Intent.ACTION_GET_CONTENT);
        content.addCategory(Intent.CATEGORY_OPENABLE);
        String type = "*/*";
        if (params != null && params.getAcceptTypes() != null
                && params.getAcceptTypes().length > 0
                && params.getAcceptTypes()[0] != null
                && !params.getAcceptTypes()[0].isEmpty()) {
            type = params.getAcceptTypes()[0];
        }
        content.setType(type);

        cameraPhotoUri = createPhotoUri();
        Intent chooser;
        if (cameraPhotoUri != null) {
            Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraPhotoUri);
            camera.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            chooser = Intent.createChooser(content, "拍照或从相册选择");
            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
        } else {
            chooser = Intent.createChooser(content, "从相册选择");
        }

        try {
            startActivityForResult(chooser, REQ_FILE_CHOOSER);
        } catch (Exception e) {
            Toast.makeText(this, "打不开文件选择器", Toast.LENGTH_SHORT).show();
            cancelFileCallback();
        }
    }

    private Uri createPhotoUri() {
        try {
            File dir = new File(getExternalFilesDir(Environment.DIRECTORY_PICTURES), "lebao");
            if (!dir.exists() && !dir.mkdirs()) return null;
            String name = "IMG_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date()) + ".jpg";
            File photo = new File(dir, name);
            return FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", photo);
        } catch (Exception e) {
            return null;
        }
    }

    private void cancelFileCallback() {
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        cameraPhotoUri = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQ_CAMERA) {
            if (filePathCallback != null) {
                Uri[] result = (resultCode == Activity.RESULT_OK && cameraPhotoUri != null)
                        ? new Uri[]{cameraPhotoUri} : null;
                filePathCallback.onReceiveValue(result);
            }
            filePathCallback = null;
            cameraPhotoUri = null;
            return;
        }

        if (requestCode == REQ_FILE_CHOOSER) {
            if (filePathCallback == null) return;
            Uri[] results = null;
            if (resultCode == Activity.RESULT_OK) {
                if (data != null) {
                    ClipData clip = data.getClipData();          // 多选（作业可以传 3 张图）
                    if (clip != null && clip.getItemCount() > 0) {
                        results = new Uri[clip.getItemCount()];
                        for (int i = 0; i < clip.getItemCount(); i++) {
                            results[i] = clip.getItemAt(i).getUri();
                        }
                    } else if (data.getDataString() != null) {
                        results = new Uri[]{Uri.parse(data.getDataString())};
                    }
                }
                if (results == null && cameraPhotoUri != null) {
                    results = new Uri[]{cameraPhotoUri};
                }
            }
            filePathCallback.onReceiveValue(results);
            filePathCallback = null;
            cameraPhotoUri = null;
        }
    }

    // ---------- 返回键：全屏先退出，再网页回退，退不动了才退出 APP ----------
    @Override
    public void onBackPressed() {
        if (customView != null) {
            exitFullscreen();            // 看着视频按返回，先退出全屏
            return;
        }
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // ---------- 生命周期 ----------
    @Override
    protected void onSaveInstanceState(@NonNull Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onPause() {
        // 切到后台时先退出全屏，免得声音在后台一直响
        if (customView != null) exitFullscreen();
        super.onPause();
        if (web != null) web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (customView != null) exitFullscreen();
        if (web != null) {
            ViewGroup parent = (ViewGroup) web.getParent();
            if (parent != null) parent.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
