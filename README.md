# TiDB vs YugabyteDB Latency Visualization

This interactive web application visualizes and compares the latency characteristics of TiDB and YugabyteDB in multi-region deployments.
It helps users understand how different database architectures handle various types of operations across distributed environments.

## Overview

This simulator demonstrates how request latency is affected by:
- Database architecture (TiDB vs YugabyteDB)
- Request types (reads vs writes)
- Client location
- Control plane leader location
- Data plane leader location
- Transaction tablet leader location (for YugabyteDB 2PC writes)

The visualization shows the packet flow between different components and calculates the total latency based on network round trips.

## How to Use

1. Select the database type (TiDB or YugabyteDB)
2. Choose the client's region
3. Select the request type (point-read, range-read, 1PC write, or 2PC write)
4. Configure the locations of control plane leader and data plane leader
5. For YugabyteDB 2PC writes, also configure the transaction tablet leader location
6. Adjust the simulation speed if needed
7. Click "Simulate" to run the visualization
