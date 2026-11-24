package tr.emlakcrm.mobile;
import android.app.Activity;
import android.util.Base64;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import android.widget.Toast;
import android.print.PrintManager;
import android.print.PrintAttributes;
import android.content.Context;
import android.webkit.JavascriptInterface;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.graphics.Bitmap;
import android.webkit.WebChromeClient;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
import android.widget.FrameLayout;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.graphics.Color;
import android.graphics.Insets;
import android.os.Build;
import android.window.OnBackInvokedDispatcher;
public class MainActivity extends Activity {
 WebView web;
 ValueCallback<Uri[]> files;
 static final int FILE_PICK=100,PDF_PICK=101;
 private static final String HOME_URL="https://emlkcrm.com.tr/index.html?apk=android-play-v5";
 // Google Play ödeme politikası: uygulama içinde abonelik satışı ve ödeme sayfasına yönlendirme yapılmaz.
 // Abonelik yalnızca web sitesinden alınır; uygulama, mevcut hesapla kullanım içindir.
 static boolean purchasePage(String url){
  try{
   Uri u=Uri.parse(url);String host=u.getHost()==null?"":u.getHost().toLowerCase();String path=u.getPath()==null?"":u.getPath().toLowerCase();
   if(host.endsWith("shopier.com")||host.endsWith("iyzipay.com")||host.endsWith("iyzico.com"))return true;
   return host.equals("emlkcrm.com.tr")&&(path.contains("abonelik-satin-al")||path.contains("odeme-sonucu")||path.contains("admin-abonelik-test"));
  }catch(Exception e){return false;}
 }
 // Sayfalara eklenen betik: satış öğelerini gizler, window.print() çağrısını Android yazdırma/PDF servisine bağlar.
 static final String PLAY_JS="(function(){try{if(window.__emlakcrmPlay)return;window.__emlakcrmPlay=1;document.documentElement.classList.add('play-app');"
  +"var st=document.createElement('style');st.textContent='a[href*=\\\"abonelik-satin-al\\\"],a[href*=\\\"shopier\\\"],[data-satis]{display:none!important}';(document.head||document.documentElement).appendChild(st);"
  +"var fix=function(t){return String(t).replace(/\\s*(;\\s*)?(abonelik satın alarak devam (edin|edebilirsiniz)|devam etmek için abonelik satın alın)\\./gi,function(m,semi){return semi?'.':''})};"
  +"var a=window.alert;window.alert=function(m){return a.call(window,fix(m))};"
  +"if(window.EmlakCRMAndroid&&typeof EmlakCRMAndroid.printDocument==='function'){window.print=function(){try{EmlakCRMAndroid.printDocument(document.title||'EmlakCRM Belge')}catch(e){}}};"
  +"var walk=function(n){if(n.nodeType===3){var v=fix(n.nodeValue);if(v!==n.nodeValue)n.nodeValue=v;return}if(n.childNodes)for(var i=0;i<n.childNodes.length;i++)walk(n.childNodes[i])};"
  +"var hide=function(){document.querySelectorAll('p,li').forEach(function(e){if(e.children.length<6&&/\\b(750|500) TL\\b/.test(e.textContent||'')&&/12 ay/.test(e.textContent||''))e.style.display='none'})};"
  +"walk(document.body);hide();new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(walk);if(m.type==='characterData')walk(m.target)});hide()}).observe(document.body,{childList:true,subtree:true,characterData:true});"
  +"}catch(e){}})();";
 byte[] pendingPdf;
 void savePdfOnDevice(String encoded,String name){try{pendingPdf=Base64.decode(encoded,Base64.DEFAULT);Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/pdf");intent.putExtra(Intent.EXTRA_TITLE,safeName(name));startActivityForResult(intent,PDF_PICK);}catch(Exception e){Toast.makeText(this,"PDF kaydedilemedi: "+e.getMessage(),Toast.LENGTH_LONG).show();}}
 String safeName(String name){String n=(name==null?"Belge.pdf":name).replaceAll("[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ._ -]","_");return n.endsWith(".pdf")?n:n+".pdf";}
 void sharePdfOnDevice(String encoded,String name){try{byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);File file=new File(getCacheDir(),"shared-document.pdf");try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);}Uri uri=Uri.parse("content://"+getPackageName()+".pdfshare/pdf");Intent intent=new Intent(Intent.ACTION_SEND);intent.setType("application/pdf");intent.putExtra(Intent.EXTRA_STREAM,uri);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.setClipData(android.content.ClipData.newUri(getContentResolver(),safeName(name),uri));startActivity(Intent.createChooser(intent,"PDF gönder"));}catch(Exception e){Toast.makeText(this,"PDF paylaşılamadı: "+e.getMessage(),Toast.LENGTH_LONG).show();}}
 @Override public void onCreate(Bundle state){super.onCreate(state); web=new WebView(this);
  // Android 15+ uygulamaları kenardan kenara çizer: sayfa durum ve gezinme çubuklarının altında kalmasın.
  FrameLayout root=new FrameLayout(this);root.setBackgroundColor(Color.parseColor("#102e50"));root.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(root);
  if(Build.VERSION.SDK_INT>=30){
   root.setOnApplyWindowInsetsListener((v,insets)->{Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout()|WindowInsets.Type.ime());v.setPadding(i.left,i.top,i.right,i.bottom);return WindowInsets.CONSUMED;});
   WindowInsetsController c=getWindow().getInsetsController();if(c!=null)c.setSystemBarsAppearance(0,WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS|WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
  }
  if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT,()->{if(web.canGoBack())web.goBack();else finish();}); WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setCacheMode(WebSettings.LOAD_NO_CACHE); web.addJavascriptInterface(new Object(){@JavascriptInterface public String store(){return "play";}@JavascriptInterface public void savePdf(String data,String name){runOnUiThread(()->savePdfOnDevice(data,name));}@JavascriptInterface public void sharePdf(String data,String name){runOnUiThread(()->sharePdfOnDevice(data,name));}@JavascriptInterface public void printDocument(String name){runOnUiThread(()->{PrintManager manager=(PrintManager)getSystemService(Context.PRINT_SERVICE);manager.print(name==null||name.isEmpty()?"EmlakCRM Belge":name,web.createPrintDocumentAdapter(name==null||name.isEmpty()?"EmlakCRM Belge":name),new PrintAttributes.Builder().build());});}},"EmlakCRMAndroid"); s.setAllowFileAccess(false); web.setWebViewClient(new WebViewClient(){
  private boolean trusted(String value){
   try{
    Uri u=Uri.parse(value);
    return "https".equalsIgnoreCase(u.getScheme())
      && "emlkcrm.com.tr".equalsIgnoreCase(u.getHost());
   }catch(Exception e){return false;}
  }
  // Older APKs and saved links may still navigate to the previous GitHub Pages path.
  // Preserve page, query and hash (including recovery links) on the new domain.
  private String migratedUrl(String value){
   try{
    Uri u=Uri.parse(value);
    String oldPath=u.getPath();
    if(!"https".equalsIgnoreCase(u.getScheme())
       ||!"enginbaysal-oss.github.io".equalsIgnoreCase(u.getHost())
       ||oldPath==null||!oldPath.startsWith("/EmlakCRM-Web/"))return null;
    String mapped="https://emlkcrm.com.tr/"+oldPath.substring("/EmlakCRM-Web/".length());
    if(u.getEncodedQuery()!=null)mapped+="?"+u.getEncodedQuery();
    if(u.getEncodedFragment()!=null)mapped+="#"+u.getEncodedFragment();
    return mapped;
   }catch(Exception e){return null;}
  }
  private boolean route(String url){
   if(purchasePage(url)){
    Toast.makeText(MainActivity.this,"Abonelik işlemleri bu uygulamada yapılmaz.",Toast.LENGTH_LONG).show();
    return true;
   }
   if(trusted(url))return false;
   final String migrated=migratedUrl(url);
   if(migrated!=null){
    web.post(()->{web.stopLoading();web.loadUrl(migrated);});
    return true;
   }
   try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}
   catch(Exception e){Toast.makeText(MainActivity.this,"Bağlantı açılamadı",Toast.LENGTH_SHORT).show();}
   return true;
  }
  @Override public boolean shouldOverrideUrlLoading(WebView v,String url){return route(url);}
  @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return route(r.getUrl().toString());}
  @Override public void onPageStarted(WebView v,String url,Bitmap favicon){
   super.onPageStarted(v,url,favicon);
   String migrated=migratedUrl(url);
   if(migrated!=null){v.stopLoading();v.loadUrl(migrated);return;}
   if(purchasePage(url)){v.stopLoading();if(v.canGoBack())v.goBack();else v.loadUrl(HOME_URL);Toast.makeText(MainActivity.this,"Abonelik işlemleri bu uygulamada yapılmaz.",Toast.LENGTH_LONG).show();}
  }
  @Override public void onPageFinished(WebView v,String url){super.onPageFinished(v,url);if(trusted(url))v.evaluateJavascript(PLAY_JS,null);}
 }); web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> callback,FileChooserParams params){files=callback;try{startActivityForResult(params.createIntent(),FILE_PICK);return true;}catch(Exception e){files=null;return false;}}}); web.loadUrl(HOME_URL);}
 @Override protected void onActivityResult(int req,int result,Intent data){super.onActivityResult(req,result,data);if(req==PDF_PICK){if(result==RESULT_OK&&data!=null&&data.getData()!=null&&pendingPdf!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(pendingPdf);Toast.makeText(this,"PDF kaydedildi",Toast.LENGTH_SHORT).show();}catch(Exception e){Toast.makeText(this,"PDF kaydedilemedi",Toast.LENGTH_LONG).show();}}pendingPdf=null;return;}if(req==FILE_PICK&&files!=null){files.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));files=null;}}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}
