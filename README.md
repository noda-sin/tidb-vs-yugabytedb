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
