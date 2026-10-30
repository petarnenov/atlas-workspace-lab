FROM eclipse-temurin:21-jdk-alpine@sha256:b78a1d385da875588e21207f07dddf9a1418849971ae857fb24c8f3a7d441a72 AS probe
WORKDIR /probe
COPY app.jar .
RUN java -Djarmode=tools -jar app.jar extract --destination extracted
COPY WorkerReady.java NetworkCheck.java ./
RUN javac -cp "extracted/lib/*" WorkerReady.java NetworkCheck.java
FROM eclipse-temurin:21-jre-alpine@sha256:82cf3d9ccbe1ed46252008d51b2f2329e6b9e8a2f4394c4bebefc3ea7f4b1372
RUN apk upgrade --no-cache
WORKDIR /app
COPY --chmod=0444 app.jar /app/app.jar
RUN java -Djarmode=tools -jar app.jar extract --destination extracted
COPY --chown=10001:10001 runtime/ /app/
COPY --from=probe /probe/WorkerReady.class /probe/NetworkCheck.class /app/probe/
USER 10001:10001
ENTRYPOINT ["java", "-Xmx192m", "-XX:MaxMetaspaceSize=192m", "-jar", "/app/app.jar"]
