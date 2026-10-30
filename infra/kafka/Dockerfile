FROM apache/kafka:4.4.0@sha256:833b867a9585a141da455dc2b57431c65cbccb27f11c91f694444cca9f777e0f
USER root
RUN apk upgrade --no-cache
ADD --checksum=sha256:58c8e0b813960d2a248e050c353baea73139b48a2ffc55382d42c69707e17325 https://repo.maven.apache.org/maven2/at/yawk/lz4/lz4-java/1.11.4/lz4-java-1.11.4.jar /opt/kafka/libs/lz4-java-1.11.4.jar
ADD --checksum=sha256:35228628442e4b9797681c7cbd3b26594f6da3379159dbd0cb07094ed3aece0d https://repo.maven.apache.org/maven2/org/xerial/snappy/snappy-java/1.1.10.9/snappy-java-1.1.10.9.jar /opt/kafka/libs/snappy-java-1.1.10.9.jar
RUN rm /opt/kafka/libs/lz4-java-1.11.2.jar /opt/kafka/libs/snappy-java-1.1.10.7.jar \
    && chmod 644 /opt/kafka/libs/lz4-java-1.11.4.jar /opt/kafka/libs/snappy-java-1.1.10.9.jar
USER appuser
