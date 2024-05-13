FROM node:20-bullseye

ARG SERVER_PORT=3000
ENV MEMBERSHIP_LOGGER_SERVER_PORT=${SERVER_PORT}

ENV MEMBERSHIP_LOGGER_UPDATE_LOGS=1

WORKDIR /app

COPY . .

RUN npm install

EXPOSE ${SERVER_PORT}

CMD npm start

# To build this container:
# docker build -t membership-logger . 

# To run this container:
# docker run -d -p 3000:3000 membership-logger