#!/bin/bash

# Exit early if any command fails
set -e

sudo echo OK

pwd

sudo docker build -f dockerfile-captain.dev -t caprover-dev-image:0.0.1 .
