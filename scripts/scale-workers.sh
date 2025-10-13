#!/bin/bash

# ==============================================================================
# Worker Scaling Script
# ==============================================================================
# This script provides easy scaling commands for worker services in both
# Docker Compose and Kubernetes environments.
#
# Usage:
#   ./scripts/scale-workers.sh <environment> <replicas>
#
# Examples:
#   ./scripts/scale-workers.sh docker 5
#   ./scripts/scale-workers.sh k8s 10
# ==============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if correct number of arguments provided
if [ "$#" -ne 2 ]; then
    print_error "Usage: $0 <environment> <replicas>"
    echo ""
    echo "Environments:"
    echo "  docker  - Scale Docker Compose workers"
    echo "  k8s     - Scale Kubernetes workers"
    echo ""
    echo "Examples:"
    echo "  $0 docker 5"
    echo "  $0 k8s 10"
    exit 1
fi

ENVIRONMENT=$1
REPLICAS=$2

# Validate replicas is a number
if ! [[ "$REPLICAS" =~ ^[0-9]+$ ]]; then
    print_error "Replicas must be a positive integer"
    exit 1
fi

# Validate replicas is at least 1
if [ "$REPLICAS" -lt 1 ]; then
    print_error "Replicas must be at least 1"
    exit 1
fi

case "$ENVIRONMENT" in
    docker)
        print_info "Scaling Docker Compose workers to $REPLICAS replicas..."

        # Check if docker-compose is available
        if ! command -v docker-compose &> /dev/null; then
            print_error "docker-compose is not installed"
            exit 1
        fi

        # Check if docker-compose.prod.yml exists
        if [ ! -f "docker-compose.prod.yml" ]; then
            print_error "docker-compose.prod.yml not found"
            print_info "Please run this script from the project root directory"
            exit 1
        fi

        # Scale workers
        docker-compose -f docker-compose.prod.yml up -d --scale worker=$REPLICAS --no-recreate

        print_info "Successfully scaled workers to $REPLICAS replicas"

        # Show current status
        print_info "Current worker status:"
        docker-compose -f docker-compose.prod.yml ps worker
        ;;

    k8s)
        print_info "Scaling Kubernetes workers to $REPLICAS replicas..."

        # Check if kubectl is available
        if ! command -v kubectl &> /dev/null; then
            print_error "kubectl is not installed"
            exit 1
        fi

        # Check if namespace exists
        if ! kubectl get namespace volume-bot &> /dev/null; then
            print_error "Namespace 'volume-bot' does not exist"
            print_info "Please deploy the application first using: kubectl apply -f k8s/"
            exit 1
        fi

        # Scale workers
        kubectl scale deployment worker --replicas=$REPLICAS -n volume-bot

        print_info "Successfully scaled workers to $REPLICAS replicas"

        # Wait for rollout
        print_info "Waiting for rollout to complete..."
        kubectl rollout status deployment/worker -n volume-bot --timeout=5m

        # Show current status
        print_info "Current worker status:"
        kubectl get pods -n volume-bot -l component=worker

        print_warning "Note: HPA is configured and may override this manual scaling"
        print_info "Current HPA status:"
        kubectl get hpa worker-hpa -n volume-bot
        ;;

    *)
        print_error "Unknown environment: $ENVIRONMENT"
        print_info "Valid environments: docker, k8s"
        exit 1
        ;;
esac

print_info "Scaling complete!"
