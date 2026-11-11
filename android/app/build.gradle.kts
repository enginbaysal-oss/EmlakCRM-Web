plugins { id("com.android.application") }
val migrationBuild = providers.gradleProperty("migrationBuild").orNull == "true"
android {
 namespace = "tr.emlakcrm.mobile"
 compileSdk = 35
 defaultConfig {
  applicationId = if (migrationBuild) "tr.emlakcrm.mobile.migration" else "tr.emlakcrm.mobile"
  minSdk = 24
  targetSdk = 28
  versionCode = 3
  versionName = "1.2.0"
  manifestPlaceholders["appLabel"] = if (migrationBuild) "EmlakCRM Yeni" else "EmlakCRM"
 }
}
