plugins {
    id("org.springframework.boot") version "4.0.9" apply false
    id("io.spring.dependency-management") version "1.1.7" apply false
}

subprojects {
    apply(plugin = "java")
    apply(plugin = "org.springframework.boot")
    apply(plugin = "io.spring.dependency-management")
    apply(plugin = "jacoco")
    extra["httpcore5.version"] = "5.4.3"
    group = "dev.atlaslab"
    version = "0.1.0-SNAPSHOT"
    repositories { mavenCentral() }
    configure<JavaPluginExtension> { toolchain { languageVersion.set(JavaLanguageVersion.of(21)) } }
    configure<JacocoPluginExtension> { toolVersion = "0.8.14" }
    dependencyLocking { lockAllConfigurations() }
    configurations.configureEach {
        resolutionStrategy.force("at.yawk.lz4:lz4-java:1.11.4", "org.xerial.snappy:snappy-java:1.1.10.9", "org.apache.httpcomponents.core5:httpcore5:5.4.3", "org.apache.httpcomponents.core5:httpcore5-h2:5.4.3")
    }
    dependencies {
        "implementation"("org.springframework.boot:spring-boot-starter-webmvc")
        "implementation"("org.springframework.boot:spring-boot-starter-jdbc")
        "implementation"("org.springframework.boot:spring-boot-starter-kafka")
        "implementation"("org.springframework.security:spring-security-oauth2-jose")
        "implementation"("com.fasterxml.jackson.core:jackson-databind")
        "implementation"(platform("software.amazon.awssdk:bom:2.57.7"))
        "implementation"("software.amazon.awssdk:s3") {
            exclude(group = "software.amazon.awssdk", module = "apache-client")
            exclude(group = "software.amazon.awssdk", module = "netty-nio-client")
        }
        "implementation"("software.amazon.awssdk:url-connection-client")
        "runtimeOnly"("org.postgresql:postgresql")
        "testImplementation"("org.springframework.boot:spring-boot-starter-test")
        "testRuntimeOnly"("org.junit.platform:junit-platform-launcher")
    }
    if (name != "demo-support") {
        dependencies { "implementation"(project(":demo-support")) }
    } else {
        tasks.named("bootJar") { enabled = false }
        tasks.named("jar") { enabled = true }
    }
    tasks.withType<JavaCompile>().configureEach { options.compilerArgs.add("-parameters") }
    tasks.withType<Test>().configureEach {
        useJUnitPlatform { if (!project.hasProperty("integration")) excludeTags("integration") }
        // Live dependency state is not a Gradle input; always execute integration checks.
        outputs.cacheIf("Unit tests only") { !project.hasProperty("integration") }
        outputs.upToDateWhen { !project.hasProperty("integration") }
        finalizedBy("jacocoTestReport")
    }
    tasks.withType<JacocoReport>().configureEach {
        dependsOn(tasks.named("test"))
        reports { xml.required.set(true); html.required.set(true) }
    }
    tasks.withType<JacocoCoverageVerification>().configureEach {
        dependsOn(tasks.named("test"))
        violationRules { rule { limit { counter = "LINE"; minimum = "0.75".toBigDecimal() } } }
    }
    tasks.named("check") { dependsOn("jacocoTestCoverageVerification") }
}
project(":processing-worker") {
    dependencies { "implementation"("org.apache.pdfbox:pdfbox:3.0.8") }
    tasks.register<Jar>("parserJar") {
        archiveClassifier.set("parser")
        duplicatesStrategy = DuplicatesStrategy.EXCLUDE
        manifest { attributes["Main-Class"] = "dev.atlaslab.worker.PdfProbe" }
        from(project.extensions.getByType<SourceSetContainer>()["main"].output)
        dependsOn(configurations.named("runtimeClasspath"))
        from({ configurations.getByName("runtimeClasspath").map { if (it.isDirectory) it else zipTree(it) } })
        exclude("META-INF/*.SF", "META-INF/*.RSA", "META-INF/*.DSA")
    }
    tasks.named("assemble") { dependsOn("parserJar") }
}
project(":processing-worker") { tasks.named("test") { dependsOn("parserJar") } }
