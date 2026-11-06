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
import android.webkit.WebChromeClient;
import android.webkit.ValueCallback;
import android.webkit.WebSettings;
public class MainActivity extends Activity {
 WebView web;
 ValueCallback<Uri[]> files;
 static final int FILE_PICK=100,PDF_PICK=101;
 byte[] pendingPdf;
 void savePdfOnDevice(String encoded,String name){try{pendingPdf=Base64.decode(encoded,Base64.DEFAULT);Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("application/pdf");intent.putExtra(Intent.EXTRA_TITLE,safeName(name));startActivityForResult(intent,PDF_PICK);}catch(Exception e){Toast.makeText(this,"PDF kaydedilemedi: "+e.getMessage(),Toast.LENGTH_LONG).show();}}
 String safeName(String name){String n=(name==null?"Belge.pdf":name).replaceAll("[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ._ -]","_");return n.endsWith(".pdf")?n:n+".pdf";}
 void sharePdfOnDevice(String encoded,String name){try{byte[] bytes=Base64.decode(encoded,Base64.DEFAULT);File file=new File(getCacheDir(),"shared-document.pdf");try(FileOutputStream out=new FileOutputStream(file)){out.write(bytes);}Uri uri=Uri.parse("content://"+getPackageName()+".pdfshare/pdf");Intent intent=new Intent(Intent.ACTION_SEND);intent.setType("application/pdf");intent.putExtra(Intent.EXTRA_STREAM,uri);intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);intent.setClipData(android.content.ClipData.newUri(getContentResolver(),safeName(name),uri));startActivity(Intent.createChooser(intent,"PDF gönder"));}catch(Exception e){Toast.makeText(this,"PDF paylaşılamadı: "+e.getMessage(),Toast.LENGTH_LONG).show();}}
 @Override public void onCreate(Bundle state){super.onCreate(state); web=new WebView(this); setContentView(web); WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); web.addJavascriptInterface(new Object(){@JavascriptInterface public void savePdf(String data,String name){runOnUiThread(()->savePdfOnDevice(data,name));}@JavascriptInterface public void sharePdf(String data,String name){runOnUiThread(()->sharePdfOnDevice(data,name));}@JavascriptInterface public void printDocument(String name){runOnUiThread(()->{PrintManager manager=(PrintManager)getSystemService(Context.PRINT_SERVICE);manager.print(name==null||name.isEmpty()?"EmlakCRM Belge":name,web.createPrintDocumentAdapter(name==null||name.isEmpty()?"EmlakCRM Belge":name),new PrintAttributes.Builder().build());});}},"EmlakCRMAndroid"); s.setAllowFileAccess(false); web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,String url){if(url.startsWith("https://enginbaysal-oss.github.io/"))return false;startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));return true;}}); web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView w,ValueCallback<Uri[]> callback,FileChooserParams params){files=callback;try{startActivityForResult(params.createIntent(),FILE_PICK);return true;}catch(Exception e){files=null;return false;}}}); web.loadUrl("https://enginbaysal-oss.github.io/EmlakCRM-Web/");}
 @Override protected void onActivityResult(int req,int result,Intent data){super.onActivityResult(req,result,data);if(req==PDF_PICK){if(result==RESULT_OK&&data!=null&&data.getData()!=null&&pendingPdf!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(pendingPdf);Toast.makeText(this,"PDF kaydedildi",Toast.LENGTH_SHORT).show();}catch(Exception e){Toast.makeText(this,"PDF kaydedilemedi",Toast.LENGTH_LONG).show();}}pendingPdf=null;return;}if(req==FILE_PICK&&files!=null){files.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));files=null;}}
 @Override public void onBackPressed(){if(web.canGoBack())web.goBack();else super.onBackPressed();}
}