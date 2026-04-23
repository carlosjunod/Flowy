FROM alpine:3.19

ARG PB_VERSION=0.36.8

RUN apk add --no-cache \
    unzip \
    ca-certificates

ADD https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip /tmp/pb.zip
RUN unzip /tmp/pb.zip -d /pb/ && rm /tmp/pb.zip

EXPOSE 8080

CMD rm -rf /pb/pb_data/data.db /pb/pb_data/auxiliary.db 2>/dev/null; \
    /pb/pocketbase serve --http=0.0.0.0:${PORT:-8080} --dir=/pb/pb_data --publicDir=/pb/pb_public