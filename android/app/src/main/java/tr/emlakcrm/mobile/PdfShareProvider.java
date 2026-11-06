package tr.emlakcrm.mobile;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
public class PdfShareProvider extends ContentProvider {
 public boolean onCreate(){return true;}
 public String getType(Uri uri){return "application/pdf";}
 public Cursor query(Uri uri,String[] projection,String selection,String[] args,String order){
  String[] cols=projection==null?new String[]{OpenableColumns.DISPLAY_NAME,OpenableColumns.SIZE}:projection;
  MatrixCursor c=new MatrixCursor(cols);Object[] row=new Object[cols.length];
  File f=new File(getContext().getCacheDir(),"shared-document.pdf");
  for(int i=0;i<cols.length;i++){if(OpenableColumns.DISPLAY_NAME.equals(cols[i]))row[i]="EmlakCRM-Belge.pdf";else if(OpenableColumns.SIZE.equals(cols[i]))row[i]=f.length();}
  c.addRow(row);return c;
 }
 public ParcelFileDescriptor openFile(Uri uri,String mode)throws FileNotFoundException{
  if(!"/pdf".equals(uri.getPath()))throw new FileNotFoundException();
  return ParcelFileDescriptor.open(new File(getContext().getCacheDir(),"shared-document.pdf"),ParcelFileDescriptor.MODE_READ_ONLY);
 }
 public Uri insert(Uri uri,ContentValues v){throw new UnsupportedOperationException();}
 public int update(Uri uri,ContentValues v,String s,String[] a){return 0;}
 public int delete(Uri uri,String s,String[] a){return 0;}
}