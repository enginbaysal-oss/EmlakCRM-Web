package tr.emlakcrm.mobile;
import android.app.Activity;
import android.print.PrintManager;
import android.print.PrintAttributes;
import android.content.Context;
import android.webkit.JavascriptInterface;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
public class MainActivity extends Activity {
 WebView web;
 ValueCallback<Uri[]> files;
 static final int FILE_PICK=100;
 @Override public void onCreate(Bundle state){super.onCreate(state); web=new WebView(this); setContentView(web); WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); web.addJavascriptInterface(new Object(){@JavascriptInterface public void printDocument(String name){runOnUiThread(()->{PrintManager manager=(PrintManager)getSystemService(Context.PRINT_SERVICE);manager.print(name==null||name.isEmpty()?"EmlakCRM Belge":name,web.createPrintDocumentAdapter(name==null||name.isEmpty()?"EmlakCRM Belge":name),new PrintAttributes.Builder().build());});}},"EmlakCRMAndroid"); s.setAllowFileAccess(false); web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,String url){if(url.startsWith("https://enginbaysal-oss.github.io/"))return false;startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));return true;}}); web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> callback,FileChooserParams params){files=callback;try{startActivityForResult(params.createIntent(),FILE_PICK);return true;}catch(Exception e){files=null;return false;}}}); web.loadUrl("https://enginbaysal-oss.github.io/EmlakCRM-Web/");}
 @Override protected void onActivityResult(int req,int result,Intent data){super.onActivityResult(req,result,data);if(req==FILE_PICK&&files!=null){files.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));files=null;}}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}