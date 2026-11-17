FROM denoland/deno:2.9.7
WORKDIR /app

COPY deno.json ./

RUN deno install 

COPY src ./src

# CMD ["deno", "run", "dev"]