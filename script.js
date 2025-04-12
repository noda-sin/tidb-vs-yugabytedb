document.addEventListener('DOMContentLoaded', () => {
    const dbTypeSelect = document.getElementById('db-type');
    const requestTypeSelect = document.getElementById('request-type');
    const controlLeaderLocationSelect = document.getElementById('control-leader-location');
    const dataLeaderLocationSelect = document.getElementById('data-leader-location');
    const speedSlider = document.getElementById('speed-slider');
    const speedValueSpan = document.getElementById('speed-value');
    const startButton = document.getElementById('simulate');
    const svg = document.getElementById('arrows-svg');
    const totalLatencySpan = document.getElementById('total-latency');
    const visualizationDiv = document.querySelector('.visualization');
    const transactionLeaderControls = document.getElementById('transaction-leader-controls');
    const transactionLeaderLocationSelect = document.getElementById('transaction-leader-location');
    const clientRegionSelect = document.getElementById('client-region');
    const controlsToToggle = [clientRegionSelect, dbTypeSelect, requestTypeSelect, controlLeaderLocationSelect, dataLeaderLocationSelect, transactionLeaderLocationSelect, speedSlider, startButton];
    const dataLeaderSingleControls = document.getElementById('data-leader-single-controls');
    const dataPlaneRegionsMultiDiv = document.getElementById('data-plane-regions-multi');
    const dataRegionCheckboxes = dataPlaneRegionsMultiDiv.querySelectorAll('input[name="data-region"]');

    const LOCAL_STORAGE_PREFIX = 'simulator_';

    const RTT = 30;
    const ONE_WAY_LATENCY = RTT / 2;
    const INTRA_REGION_LATENCY = 1; // Minimal latency for animation within the same region
    const NETWORK_LATENCY_THRESHOLD = INTRA_REGION_LATENCY; // Latencies below this are considered local/negligible for accumulation

    const REGIONS = ['a', 'b', 'c'];

    const getLatency = (region1, region2) => {
        return region1 === region2 ? INTRA_REGION_LATENCY : ONE_WAY_LATENCY;
    };

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const toggleControls = (disabled) => {
        controlsToToggle.forEach(el => el.disabled = disabled);
    };

    const getElementCenter = (elementId) => {
        const element = document.getElementById(elementId);
        if (!element || element.style.display === 'none') {
            return null;
        }
        const rect = element.getBoundingClientRect();
        const containerRect = visualizationDiv.getBoundingClientRect();
        if (containerRect.width === 0 || containerRect.height === 0) {
            console.error("Visualization container has zero dimensions.");
            return null;
        }
        const x = rect.left + rect.width / 2 - containerRect.left;
        const y = rect.top + rect.height / 2 - containerRect.top;
        return { x, y };
    };

    const updateClientPosition = () => {
        const selectedRegion = clientRegionSelect.value;
        const clientElement = document.getElementById('client');
        const targetRegionDiv = document.getElementById(`region-${selectedRegion}`);

        if (clientElement && targetRegionDiv) {
            const h2Element = targetRegionDiv.querySelector('h2');
            if (h2Element && h2Element.nextSibling) {
                targetRegionDiv.insertBefore(clientElement, h2Element.nextSibling);
            } else if (h2Element) {
                targetRegionDiv.appendChild(clientElement);
            } else {
                targetRegionDiv.insertBefore(clientElement, targetRegionDiv.firstChild);
            }
            clientElement.style.display = '';
        } else {
            console.error("Could not find client element or target region div for positioning.");
        }
    };

    const setupSvgMarkers = () => {
        const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '8');
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto');
        const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
        polygon.setAttribute('fill', 'blue');
        marker.appendChild(polygon);
        let defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            svg.appendChild(defs);
        }
        if (!defs.querySelector('#arrowhead')) {
            defs.appendChild(marker);
        }
    };
    setupSvgMarkers();

    function clearVisualization() {
        const existingAnimations = svg.querySelectorAll('.arrow, .moving-dot');
        existingAnimations.forEach(el => el.remove());
        totalLatencySpan.textContent = '0';

        const dbType = dbTypeSelect.value;
        const controlLeaderRegion = controlLeaderLocationSelect.value;

        document.querySelectorAll('.pd-leader-node, .tidb-node, .tikv-node, .yb-master-node, .yb-tserver-node').forEach(node => {
            node.style.display = 'none';
        });

        updateClientPosition();

        const clientRegion = clientRegionSelect.value;
        if (dbType === 'tidb') {
            document.querySelectorAll('.tikv-node').forEach(node => node.style.display = '');
            const localTiDBNode = document.getElementById(`tidb-${clientRegion}`);
            if (localTiDBNode) localTiDBNode.style.display = '';
            const pdLeaderNode = document.getElementById(`pd-${controlLeaderRegion}`);
            if (pdLeaderNode) pdLeaderNode.style.display = '';
        } else if (dbType === 'yugabyte') {
            document.querySelectorAll('.yb-tserver-node').forEach(node => node.style.display = '');
            const ybMasterLeaderNode = document.getElementById(`yb-master-${controlLeaderRegion}`);
            if (ybMasterLeaderNode) ybMasterLeaderNode.style.display = '';
        }

        document.querySelectorAll('.tikv-node, .yb-tserver-node').forEach(node => {
            node.classList.remove('data-leader-indicator');
        });

        const requestType = requestTypeSelect.value;
        if (requestType === 'range-read') {
            const selectedRegions = Array.from(dataRegionCheckboxes)
                                        .filter(cb => cb.checked)
                                        .map(cb => cb.value);
            selectedRegions.forEach(region => {
                const nodeId = dbType === 'tidb' ? `tikv-${region}` : `yb-tserver-${region}`;
                const nodeElement = document.getElementById(nodeId);
                if (nodeElement && nodeElement.style.display !== 'none') {
                    nodeElement.classList.add('data-leader-indicator');
                }
            });
        } else {
             const dataLeaderRegion = dataLeaderLocationSelect.value;
             const dataLeaderNodeId = dbType === 'tidb' ? `tikv-${dataLeaderRegion}` : `yb-tserver-${dataLeaderRegion}`;
             const dataLeaderNodeElement = document.getElementById(dataLeaderNodeId);
             if (dataLeaderNodeElement && dataLeaderNodeElement.style.display !== 'none') {
                 dataLeaderNodeElement.classList.add('data-leader-indicator');
             }
        }
    }

    async function animatePacket(startNodeId, endNodeId, latency, accumulatedLatency, notAddLatency = false) {
        const startPos = getElementCenter(startNodeId);
        const endPos = getElementCenter(endNodeId);

        if (!startPos || !endPos) {
             console.warn(`Skipping animation: Cannot find/get position for ${startNodeId} or ${endNodeId}`);
             return accumulatedLatency;
        }

        const isNetworkLatency = latency >= NETWORK_LATENCY_THRESHOLD;
        const maxSpeed = parseInt(speedSlider.max, 10);
        const currentSpeed = parseInt(speedSlider.value, 10);
        const animationSpeedFactor = Math.max(0.1, (maxSpeed + 1 - currentSpeed) * 100);
        const animationDuration = Math.max(50, latency * animationSpeedFactor * (isNetworkLatency ? 1 : 0.5));

        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', startPos.x);
        dot.setAttribute('cy', startPos.y);
        dot.setAttribute('class', 'moving-dot');
        svg.appendChild(dot);

        await sleep(10);
        dot.style.opacity = 1;

        const animation = dot.animate([
            { cx: startPos.x, cy: startPos.y, offset: 0 },
            { cx: endPos.x, cy: endPos.y, offset: 1 }
        ], {
            duration: animationDuration,
            easing: 'linear',
            fill: 'forwards'
        });

        await animation.finished;

        let newTotalLatency = accumulatedLatency;
        if (isNetworkLatency && !notAddLatency) {
            newTotalLatency += latency;
            totalLatencySpan.textContent = newTotalLatency.toFixed(0);
        }

        dot.style.opacity = 0;
        await sleep(50);
        dot.remove();
        return newTotalLatency;
    }


    async function animateParallelFetch(sourceNodeId, targetNodeIds, clientRegion, accumulatedLatency) {
        if (!targetNodeIds || targetNodeIds.length === 0) {
            console.warn("animateParallelFetch called with no target nodes.");
            return accumulatedLatency; // Return unchanged latency
        }

        const sourceRegion = clientRegion; // Assume source is client's region for range reads
        let maxOneWayLatency = 0;

        targetNodeIds.forEach(targetNodeId => {
            const targetRegionMatch = targetNodeId.match(/-([abc])$/); // Extract region (a, b, or c)
            if (targetRegionMatch) {
                const targetRegion = targetRegionMatch[1];
                const latency = getLatency(sourceRegion, targetRegion);
                if (latency > maxOneWayLatency) {
                    maxOneWayLatency = latency;
                }
            } else {
                 console.error(`Could not extract region from targetNodeId: ${targetNodeId}`);
            }
        });

        const isNetworkHop = maxOneWayLatency >= NETWORK_LATENCY_THRESHOLD;
        let currentLatency = accumulatedLatency;

        const promisesOut = targetNodeIds.map((targetNodeId, index) => {
            const addLatency = (index === 0) && isNetworkHop;
            return animatePacket(sourceNodeId, targetNodeId, maxOneWayLatency, currentLatency, !addLatency);
        });
        const resultsOut = await Promise.all(promisesOut);
        if (isNetworkHop) {
            currentLatency += maxOneWayLatency;
            totalLatencySpan.textContent = currentLatency.toFixed(0); // Update UI immediately
        }


        const promisesIn = targetNodeIds.map((targetNodeId, index) => {
             const addLatency = (index === 0) && isNetworkHop;
            return animatePacket(targetNodeId, sourceNodeId, maxOneWayLatency, currentLatency, !addLatency);
        });
        const resultsIn = await Promise.all(promisesIn);
        if (isNetworkHop) {
            currentLatency += maxOneWayLatency;
             totalLatencySpan.textContent = currentLatency.toFixed(0); // Update UI immediately
        }

        return currentLatency; // Return the final accumulated latency
    }

    async function animateQuorumWrite(leader, follower1, follower2, accumulatedLatency, isAsync = false) {
        // Leader -> Followers (Parallel)
        const promise1 = animatePacket(leader, follower1, ONE_WAY_LATENCY, accumulatedLatency, isAsync);
        const promise2 = animatePacket(leader, follower2, ONE_WAY_LATENCY, accumulatedLatency, true); // Don't add latency for the second parallel packet
        const results1 = await Promise.all([promise1, promise2]);
        let currentLatency = results1[0]; // Use latency from the first promise if sync

        // Followers -> Leader (Parallel) - Response
        const promise3 = animatePacket(follower1, leader, ONE_WAY_LATENCY, currentLatency, isAsync);
        const promise4 = animatePacket(follower2, leader, ONE_WAY_LATENCY, currentLatency, true); // Don't add latency for the second parallel packet
        const results2 = await Promise.all([promise3, promise4]);
        return results2[0]; // Return latency from the first promise if sync
    }

    // --- TiDB Scenarios ---
    async function runTiDBPointRead(controlLeaderRegion, dataLeaderRegion) {
        let currentLatency = 0;
        const clientRegion = clientRegionSelect.value;
        const client = 'client';
        const tidbNode = `tidb-${clientRegion}`;
        const tikvNode = `tikv-${dataLeaderRegion}`;

        document.querySelectorAll('.tidb-node').forEach(node => node.style.display = 'none');
        const tidbNodeElement = document.getElementById(tidbNode);
        if (tidbNodeElement) tidbNodeElement.style.display = '';

        currentLatency = await animatePacket(client, tidbNode, getLatency(clientRegion, clientRegion), currentLatency);
        const latencyToTiKV = getLatency(clientRegion, dataLeaderRegion);
        currentLatency = await animatePacket(tidbNode, tikvNode, latencyToTiKV, currentLatency);
        currentLatency = await animatePacket(tikvNode, tidbNode, latencyToTiKV, currentLatency);
        currentLatency = await animatePacket(tidbNode, client, getLatency(clientRegion, clientRegion), currentLatency);
        return currentLatency;
    }

    async function runTiDBPointWrite(controlLeaderRegion, dataLeaderRegion) {
        let currentLatency = 0;
        const clientRegion = clientRegionSelect.value;
        const client = 'client';
        const tidbNode = `tidb-${clientRegion}`;
        const pdLeader = `pd-${controlLeaderRegion}`;
        const tikvLeader = `tikv-${dataLeaderRegion}`;
        const followerRegions = REGIONS.filter(r => r !== dataLeaderRegion);
        const tikvFollower1 = `tikv-${followerRegions[0]}`;
        const tikvFollower2 = `tikv-${followerRegions[1]}`;

        document.querySelectorAll('.tidb-node').forEach(node => node.style.display = 'none');
        const tidbNodeElement = document.getElementById(tidbNode);
        if (tidbNodeElement) tidbNodeElement.style.display = '';

        currentLatency = await animatePacket(client, tidbNode, getLatency(clientRegion, clientRegion), currentLatency);
        const latencyToPD = getLatency(clientRegion, controlLeaderRegion);
        currentLatency = await animatePacket(tidbNode, pdLeader, latencyToPD, currentLatency);
        currentLatency = await animatePacket(pdLeader, tidbNode, latencyToPD, currentLatency);
        const latencyToTiKVLeader = getLatency(clientRegion, dataLeaderRegion);
        currentLatency = await animatePacket(tidbNode, tikvLeader, latencyToTiKVLeader, currentLatency);
        currentLatency = await animateQuorumWrite(tikvLeader, tikvFollower1, tikvFollower2, currentLatency);
        currentLatency = await animatePacket(tikvLeader, tidbNode, latencyToTiKVLeader, currentLatency);
        currentLatency = await animatePacket(tidbNode, client, getLatency(clientRegion, clientRegion), currentLatency);
        return currentLatency;
    }

    async function runTiDBRangeRead(controlLeaderRegion, dataPlaneParam) { // dataPlaneParam can be string or array
        let currentLatency = 0;
        const clientRegion = clientRegionSelect.value;
        const client = 'client';
        const tidbNode = `tidb-${clientRegion}`;
        const pdLeader = `pd-${controlLeaderRegion}`;

        document.querySelectorAll('.tidb-node').forEach(node => node.style.display = 'none');
        const tidbNodeElement = document.getElementById(tidbNode);
        if (tidbNodeElement) tidbNodeElement.style.display = '';

        currentLatency = await animatePacket(client, tidbNode, getLatency(clientRegion, clientRegion), currentLatency);

        const latencyToPD = getLatency(clientRegion, controlLeaderRegion);
        currentLatency = await animatePacket(tidbNode, pdLeader, latencyToPD, currentLatency);
        currentLatency = await animatePacket(pdLeader, tidbNode, latencyToPD, currentLatency);

        const targetRegions = Array.isArray(dataPlaneParam) ? dataPlaneParam : [dataPlaneParam];
        const tikvNodes = targetRegions.map(region => `tikv-${region}`);
        currentLatency = await animateParallelFetch(tidbNode, tikvNodes, clientRegion, currentLatency);

        currentLatency = await animatePacket(tidbNode, client, getLatency(clientRegion, clientRegion), currentLatency);
        return currentLatency;
    }

    async function runTiDBRangeWrite(controlLeaderRegion, dataLeaderRegion) { // Percolator 2PC
        let currentLatency = 0;
        const clientRegion = clientRegionSelect.value;
        const client = 'client';
        const tidbNode = `tidb-${clientRegion}`;
        const pdLeader = `pd-${controlLeaderRegion}`;
        const tikvLeader = `tikv-${dataLeaderRegion}`;
        const followerRegions = REGIONS.filter(r => r !== dataLeaderRegion);
        const tikvFollower1 = `tikv-${followerRegions[0]}`;
        const tikvFollower2 = `tikv-${followerRegions[1]}`;

        document.querySelectorAll('.tidb-node').forEach(node => node.style.display = 'none');
        const tidbNodeElement = document.getElementById(tidbNode);
        if (tidbNodeElement) tidbNodeElement.style.display = '';

        currentLatency = await animatePacket(client, tidbNode, getLatency(clientRegion, clientRegion), currentLatency); // Client interaction

        // Get Commit TS from PD
        const latencyToPD = getLatency(clientRegion, controlLeaderRegion);
        currentLatency = await animatePacket(tidbNode, pdLeader, latencyToPD, currentLatency);
        currentLatency = await animatePacket(pdLeader, tidbNode, latencyToPD, currentLatency);

        // Prewrite Phase
        const latencyToTiKVLeader = getLatency(clientRegion, dataLeaderRegion);
        currentLatency = await animatePacket(tidbNode, tikvLeader, latencyToTiKVLeader, currentLatency); // Prewrite primary
        currentLatency = await animateQuorumWrite(tikvLeader, tikvFollower1, tikvFollower2, currentLatency); // Prewrite primary replication
        currentLatency = await animatePacket(tikvLeader, tidbNode, latencyToTiKVLeader, currentLatency); // Prewrite primary success

        // Commit Phase (Async for Percolator)
        const asyncCommitPromise = (async () => {
            let commitLatency = currentLatency;
            commitLatency = await animatePacket(tidbNode, tikvLeader, latencyToTiKVLeader, commitLatency, true); // Commit primary (async)
            await animateQuorumWrite(tikvLeader, tikvFollower1, tikvFollower2, commitLatency, true); // Commit primary replication (async)
        })();

        // Respond to client after prewrite success
        currentLatency = await animatePacket(tidbNode, client, getLatency(clientRegion, clientRegion), currentLatency);

        await asyncCommitPromise;
        return currentLatency; // Return latency when client gets response
    }

    // --- YugabyteDB Scenarios ---
    async function runYugabytePointRead(controlLeaderRegion, dataLeaderRegion) {
        let currentLatency = 0;
        const clientRegion = clientRegionSelect.value;
        const client = 'client';
        const localTServer = `yb-tserver-${clientRegion}`;
        const tabletLeader = `yb-tserver-${dataLeaderRegion}`;

        currentLatency = await animatePacket(client, localTServer, getLatency(clientRegion, clientRegion), currentLatency);
        const latencyToLeader = getLatency(clientRegion, dataLeaderRegion);
        currentLatency = await animatePacket(localTServer, tabletLeader, latencyToLeader, currentLatency);
        currentLatency = await animatePacket(tabletLeader, localTServer, latencyToLeader, currentLatency);
        currentLatency = await animatePacket(localTServer, client, getLatency(clientRegion, clientRegion), currentLatency);
        return currentLatency;
    }

    async function runYugabytePointWrite(controlLeaderRegion, dataLeaderRegion) { // Single Row Tx (Raft)
        let currentLatency = 0;
        const clientRegion = clientRegionSelect.value;
        const client = 'client';
        const localTServer = `yb-tserver-${clientRegion}`;
        const tabletLeader = `yb-tserver-${dataLeaderRegion}`;
        const followerRegions = REGIONS.filter(r => r !== dataLeaderRegion);
        const tabletFollower1 = `yb-tserver-${followerRegions[0]}`;
        const tabletFollower2 = `yb-tserver-${followerRegions[1]}`;

        currentLatency = await animatePacket(client, localTServer, getLatency(clientRegion, clientRegion), currentLatency);
        const latencyToLeader = getLatency(clientRegion, dataLeaderRegion);
        currentLatency = await animatePacket(localTServer, tabletLeader, latencyToLeader, currentLatency); // Write to leader
        currentLatency = await animateQuorumWrite(tabletLeader, tabletFollower1, tabletFollower2, currentLatency); // Raft replication
        currentLatency = await animatePacket(tabletLeader, localTServer, latencyToLeader, currentLatency); // Ack to coordinator
        currentLatency = await animatePacket(localTServer, client, getLatency(clientRegion, clientRegion), currentLatency); // Ack to client
        return currentLatency;
    }

     async function runYugabyteRangeRead(controlLeaderRegion, dataPlaneParam) { // Multi-Row Read (Simplified), dataPlaneParam can be string or array
        let currentLatency = 0;
        const clientRegion = clientRegionSelect.value;
        const client = 'client';
        const localTServer = `yb-tserver-${clientRegion}`; // Coordinator TServer

        currentLatency = await animatePacket(client, localTServer, getLatency(clientRegion, clientRegion), currentLatency);

        const targetRegions = Array.isArray(dataPlaneParam) ? dataPlaneParam : [dataPlaneParam];
        const tabletLeaders = targetRegions.map(region => `yb-tserver-${region}`);
        currentLatency = await animateParallelFetch(localTServer, tabletLeaders, clientRegion, currentLatency);

        currentLatency = await animatePacket(localTServer, client, getLatency(clientRegion, clientRegion), currentLatency);
        return currentLatency;
    }


    async function runYugabyteRangeWrite(controlLeaderRegion, dataLeaderRegion, transactionLeaderRegion) { // DocDB 2PC
        let currentLatency = 0;
        const clientRegion = clientRegionSelect.value;
        const client = 'client';
        const localTServer = `yb-tserver-${clientRegion}`; // Coordinator TServer
        const transactionStatusTabletLeader = `yb-tserver-${transactionLeaderRegion}`;
        const involvedTabletLeader = `yb-tserver-${dataLeaderRegion}`;
        const statusFollowerRegions = REGIONS.filter(r => r !== transactionLeaderRegion);
        const statusFollower1 = `yb-tserver-${statusFollowerRegions[0]}`;
        const statusFollower2 = `yb-tserver-${statusFollowerRegions[1]}`;
        const dataFollowerRegions = REGIONS.filter(r => r !== dataLeaderRegion);
        const dataFollower1 = `yb-tserver-${dataFollowerRegions[0]}`;
        const dataFollower2 = `yb-tserver-${dataFollowerRegions[1]}`;

        currentLatency = await animatePacket(client, localTServer, getLatency(clientRegion, clientRegion), currentLatency);

        // Write Transaction Status Record
        const latencyToStatusLeader = getLatency(clientRegion, transactionLeaderRegion);
        currentLatency = await animatePacket(localTServer, transactionStatusTabletLeader, latencyToStatusLeader, currentLatency);
        currentLatency = await animateQuorumWrite(transactionStatusTabletLeader, statusFollower1, statusFollower2, currentLatency);
        currentLatency = await animatePacket(transactionStatusTabletLeader, localTServer, latencyToStatusLeader, currentLatency); // Ack

        // Write Provisional Records
        const latencyToDataLeader = getLatency(clientRegion, dataLeaderRegion);
        currentLatency = await animatePacket(localTServer, involvedTabletLeader, latencyToDataLeader, currentLatency);
        currentLatency = await animateQuorumWrite(involvedTabletLeader, dataFollower1, dataFollower2, currentLatency);
        currentLatency = await animatePacket(involvedTabletLeader, localTServer, latencyToDataLeader, currentLatency); // Ack

        // Commit Status Tablet
        currentLatency = await animatePacket(localTServer, transactionStatusTabletLeader, latencyToStatusLeader, currentLatency);
        currentLatency = await animateQuorumWrite(transactionStatusTabletLeader, statusFollower1, statusFollower2, currentLatency);

        // Apply Phase (Async)
        const asyncApplyPromise = (async () => {
            let applyLatency = currentLatency;
            const statusToDataLatency = getLatency(transactionLeaderRegion, dataLeaderRegion);
            applyLatency = await animatePacket(transactionStatusTabletLeader, involvedTabletLeader, statusToDataLatency, applyLatency, true); // Apply provisional records (async)
            await animateQuorumWrite(involvedTabletLeader, dataFollower1, dataFollower2, applyLatency, true); // Apply replication (async)
        })();

        // Ack Commit back to Coordinator
        currentLatency = await animatePacket(transactionStatusTabletLeader, localTServer, latencyToStatusLeader, currentLatency);

        // Ack back to Client
        currentLatency = await animatePacket(localTServer, client, getLatency(clientRegion, clientRegion), currentLatency);

        await asyncApplyPromise;
        return currentLatency; // Return latency when client is acked
    }


    const scenarioRunners = {
        tidb: {
            'point-read': runTiDBPointRead,
            '1pc-write': runTiDBPointWrite,
            'range-read': runTiDBRangeRead,
            '2pc-write': runTiDBRangeWrite,
        },
        yugabyte: {
            'point-read': runYugabytePointRead,
            '1pc-write': runYugabytePointWrite,
            'range-read': runYugabyteRangeRead,
            '2pc-write': runYugabyteRangeWrite,
        }
    };

    startButton.addEventListener('click', async () => {
        const db = dbTypeSelect.value;
        const req = requestTypeSelect.value;
        const controlLeader = controlLeaderLocationSelect.value;
        let dataPlaneParam; // Can be a single string or an array of strings
        if (req === 'range-read') {
            dataPlaneParam = Array.from(dataRegionCheckboxes)
                                .filter(cb => cb.checked)
                                .map(cb => cb.value);
            if (dataPlaneParam.length === 0) {
                const firstCheckbox = dataRegionCheckboxes[0];
                 if (firstCheckbox) {
                     firstCheckbox.checked = true;
                     dataPlaneParam = [firstCheckbox.value];
                     console.warn("No data plane region selected for range-read, defaulting to Region A.");
                 } else {
                    alert("Error: Could not find any data plane region checkboxes.");
                    return; // Stop if no checkboxes exist
                 }
            }
        } else {
            dataPlaneParam = dataLeaderLocationSelect.value; // Single region string
        }
        const transactionLeader = transactionLeaderLocationSelect.value;

        const runner = scenarioRunners[db]?.[req];

        if (runner) {
            toggleControls(true);
            clearVisualization();
            await sleep(100);

            try {
                if (db === 'yugabyte' && req === '2pc-write') {
                    await runner(controlLeader, dataLeaderLocationSelect.value, transactionLeader);
                } else {
                    await runner(controlLeader, dataPlaneParam);
                }
            } catch (error) {
                console.error("Animation failed:", error);
                alert("An error occurred during the animation.");
            } finally {
                toggleControls(false);
            }
        } else {
            alert('Selected scenario is not implemented yet.');
        }
    });

    speedSlider.addEventListener('input', () => {
        speedValueSpan.textContent = speedSlider.value;
        saveControlState();
    });

    const updateTransactionLeaderVisibility = () => {
        const show = dbTypeSelect.value === 'yugabyte' && requestTypeSelect.value === '2pc-write';
        transactionLeaderControls.style.display = show ? '' : 'none';
    };


    const updateDataPlaneSelectionUI = () => {
        const isRangeRead = requestTypeSelect.value === 'range-read';
        dataLeaderSingleControls.style.display = isRangeRead ? 'none' : '';
        dataPlaneRegionsMultiDiv.style.display = isRangeRead ? 'inline-block' : 'none'; // Use inline-block

        if (isRangeRead && dataPlaneRegionsMultiDiv.style.display !== 'none') {
            let oneChecked = false;
            dataRegionCheckboxes.forEach(cb => { if (cb.checked) oneChecked = true; });
            if (!oneChecked) {
                const firstCheckbox = dataRegionCheckboxes[0];
                if (firstCheckbox) {
                    firstCheckbox.checked = true;
                    dataLeaderLocationSelect.value = firstCheckbox.value;
                }
            }
        } else if (!isRangeRead) {
             const singleValue = dataLeaderLocationSelect.value;
             dataRegionCheckboxes.forEach(cb => {
                 cb.checked = (cb.value === singleValue);
             });
        }
    };

    [clientRegionSelect, dbTypeSelect, requestTypeSelect, controlLeaderLocationSelect, dataLeaderLocationSelect, transactionLeaderLocationSelect].forEach(select => {
        select.addEventListener('change', () => {
            saveControlState();
            updateTransactionLeaderVisibility();

            if (select === clientRegionSelect || select === dbTypeSelect || select === controlLeaderLocationSelect || select === dataLeaderLocationSelect || select === transactionLeaderLocationSelect) {
        updateDataPlaneSelectionUI(); // Add this call

                 clearVisualization();
            }
        });
    });


    const saveControlState = () => {
        try {
            localStorage.setItem(LOCAL_STORAGE_PREFIX + 'dbType', dbTypeSelect.value);
            localStorage.setItem(LOCAL_STORAGE_PREFIX + 'requestType', requestTypeSelect.value);
            localStorage.setItem(LOCAL_STORAGE_PREFIX + 'controlLeader', controlLeaderLocationSelect.value);
            localStorage.setItem(LOCAL_STORAGE_PREFIX + 'dataLeader', dataLeaderLocationSelect.value);
            localStorage.setItem(LOCAL_STORAGE_PREFIX + 'transactionLeader', transactionLeaderLocationSelect.value);
            localStorage.setItem(LOCAL_STORAGE_PREFIX + 'speed', speedSlider.value);
            localStorage.setItem(LOCAL_STORAGE_PREFIX + 'clientRegion', clientRegionSelect.value);
        } catch (e) {
            console.error("Failed to save state to localStorage:", e);
        }
    };

    const loadControlState = () => {
        try {
            const dbType = localStorage.getItem(LOCAL_STORAGE_PREFIX + 'dbType');
            const requestType = localStorage.getItem(LOCAL_STORAGE_PREFIX + 'requestType');
            const controlLeader = localStorage.getItem(LOCAL_STORAGE_PREFIX + 'controlLeader');
            const dataLeader = localStorage.getItem(LOCAL_STORAGE_PREFIX + 'dataLeader');
            const transactionLeader = localStorage.getItem(LOCAL_STORAGE_PREFIX + 'transactionLeader');
            const speed = localStorage.getItem(LOCAL_STORAGE_PREFIX + 'speed');
            const clientRegion = localStorage.getItem(LOCAL_STORAGE_PREFIX + 'clientRegion');

            if (clientRegion) clientRegionSelect.value = clientRegion;
            if (dbType) dbTypeSelect.value = dbType;
            if (requestType) requestTypeSelect.value = requestType;
            if (controlLeader) controlLeaderLocationSelect.value = controlLeader;
            if (dataLeader) dataLeaderLocationSelect.value = dataLeader;
            if (transactionLeader) transactionLeaderLocationSelect.value = transactionLeader;
            if (speed) {
                 speedSlider.value = speed;
                 speedValueSpan.textContent = speed;
            }
        } catch (e) {
            console.error("Failed to load state from localStorage:", e);
        }
    };

    // Initial Setup
    loadControlState();
    updateClientPosition();
    updateDataPlaneSelectionUI(); // Add this call

    updateTransactionLeaderVisibility();
    clearVisualization();
});
