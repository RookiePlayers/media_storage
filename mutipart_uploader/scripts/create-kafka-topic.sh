!#/bin/bash

# This script creates a Kafka topic using the Kafka CLI tools within a Docker container. It assumes that the Docker container is already running and has the necessary Kafka CLI tools installed.
# Usage: ./create-kafka-topic.sh <topic-name> <partitions> <replication-factor>

if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <topic-name> <partitions> <replication-factor>"
    exit 1
fi

TOPIC_NAME=$1
PARTITIONS=$2
REPLICATION_FACTOR=$3

# Execute the Kafka CLI command to create the topic
docker exec -it kafka /opt/kafka/bin/kafka-topics.sh --create \
    --topic $TOPIC_NAME \
    --partitions $PARTITIONS \
    --replication-factor $REPLICATION_FACTOR \
    --bootstrap-server localhost:9092

