plugins { id("com.android.application") }
val migrationBuild = providers.gradleProperty("migrationBuild").orNull == "true"
android {
 namespace = "tr.emlakcrm.mobile"
 compileSdk = 36
 defaultConfig {
  applicationId = if (migrationBuild) "tr.emlakcrm.mobile.migration" else "tr.emlakcrm.mobile"
  minSdk = 24
  targetSdk = 36
  versionCode = 6
  versionName = "1.3.2"
  manifestPlaceholders["appLabel"] = if (migrationBuild) "EmlakCRM Yeni" else "EmlakCRM"
 }
}
