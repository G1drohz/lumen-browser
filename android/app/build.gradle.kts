plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "dev.g1drohz.lumen"
    compileSdk = 34

    defaultConfig {
        applicationId = "dev.g1drohz.lumen"
        minSdk = 29
        targetSdk = 34
        versionCode = 31
        versionName = "3.1.1"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    sourceSets {
        // Общие файлы (blocklist.txt, start.html) берём из shared/ в корне репозитория
        getByName("main") {
            assets.srcDirs("../../shared")
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
}
