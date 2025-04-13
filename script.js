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
    const LOCAL_STORAGE_PREFIX = 'simulator_';

    const RTT = 30;
    const ONE_WAY_LATENCY = RTT / 2;
    const INTRA_REGION_LATENCY = 1; // Latency for animation within the same region
    const NETWORK_LATENCY_THRESHOLD = 2; // Minimum network latency to display
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

        const dataLeaderRegion = dataLeaderLocationSelect.value;
        const dataLeaderNodeId = dbType === 'tidb' ? `tikv-${dataLeaderRegion}` : `yb-tserver-${dataLeaderRegion}`;

        document.querySelectorAll('.tikv-node, .yb-tserver-node').forEach(node => {
            node.classList.remove('data-leader-indicator');
        });

        const dataLeaderNodeElement = document.getElementById(dataLeaderNodeId);
        if (dataLeaderNodeElement && dataLeaderNodeElement.style.display !== 'none') {
            dataLeaderNodeElement.classList.add('data-leader-indicator');
        }
    }

    // Function to update the total latency display and return the new accumulated latency
    async function updateLatency(latency, accumulatedLatency) {
        const isNetworkLatency = latency >= NETWORK_LATENCY_THRESHOLD;
        let newTotalLatency = accumulatedLatency;

        if (isNetworkLatency) {
            newTotalLatency += latency;
            totalLatencySpan.textContent = newTotalLatency.toFixed(0);
        }

        return newTotalLatency;
    }

    // Animation function that only handles visualization, no latency calculation
    async function animatePacket(startNodeId, endNodeId) {
        const startPos = getElementCenter(startNodeId);
        const endPos = getElementCenter(endNodeId);

        if (!startPos || !endPos) {
             console.warn(`Skipping animation: Cannot find/get position for ${startNodeId} or ${endNodeId}`);
             return;
        }

        // Calculate animation duration based on speed slider
        const maxSpeed = parseInt(speedSlider.max, 10);
        const currentSpeed = parseInt(speedSlider.value, 10);
        const animationDuration = (maxSpeed + 1 - currentSpeed) * 200;

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

        dot.style.opacity = 0;
        await sleep(50);
        dot.remove();
    }

    async function animateQuorumWrite(leader, follower1, follower2, accumulatedLatency, isAsync = false) {
        // Calculate latency first
        let currentLatency = accumulatedLatency;

        // Leader -> Followers (Parallel)
        const promise1 = animatePacket(leader, follower1);
        const promise2 = animatePacket(leader, follower2);
        await Promise.all([promise1, promise2]);
        if (!isAsync) {
            currentLatency = await updateLatency(ONE_WAY_LATENCY, currentLatency);
        }

        // Followers -> Leader (Parallel) - Response
        const promise3 = animatePacket(follower1, leader);
        const promise4 = animatePacket(follower2, leader);
        await Promise.all([promise3, promise4]);
        if (!isAsync) {
            currentLatency = await updateLatency(ONE_WAY_LATENCY, currentLatency);
        }

        return currentLatency;
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

        // Client to TiDB
        const clientToTiDBLatency = getLatency(clientRegion, clientRegion);
        await animatePacket(client, tidbNode);
        currentLatency = await updateLatency(clientToTiDBLatency, currentLatency);

        // TiDB to TiKV
        const latencyToTiKV = getLatency(clientRegion, dataLeaderRegion);
        await animatePacket(tidbNode, tikvNode);
        currentLatency = await updateLatency(latencyToTiKV, currentLatency);

        // TiKV to TiDB
        await animatePacket(tikvNode, tidbNode);
        currentLatency = await updateLatency(latencyToTiKV, currentLatency);

        // TiDB to Client
        await animatePacket(tidbNode, client);
        currentLatency = await updateLatency(clientToTiDBLatency, currentLatency);

        return currentLatency;
    }

    async function runTiDB1PCWrite(controlLeaderRegion, dataLeaderRegion) {
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

        // Client to TiDB
        const clientToTiDBLatency = getLatency(clientRegion, clientRegion);
        await animatePacket(client, tidbNode);
        currentLatency = await updateLatency(clientToTiDBLatency, currentLatency);

        // TiDB to PD Leader
        const latencyToPD = getLatency(clientRegion, controlLeaderRegion);
        await animatePacket(tidbNode, pdLeader);
        currentLatency = await updateLatency(latencyToPD, currentLatency);

        // PD Leader to TiDB
        await animatePacket(pdLeader, tidbNode);
        currentLatency = await updateLatency(latencyToPD, currentLatency);

        // TiDB to TiKV Leader
        const latencyToTiKVLeader = getLatency(clientRegion, dataLeaderRegion);
        await animatePacket(tidbNode, tikvLeader);
        currentLatency = await updateLatency(latencyToTiKVLeader, currentLatency);

        // TiKV Leader to Followers (Quorum Write)
        currentLatency = await animateQuorumWrite(tikvLeader, tikvFollower1, tikvFollower2, currentLatency);

        // TiKV Leader to TiDB
        await animatePacket(tikvLeader, tidbNode);
        currentLatency = await updateLatency(latencyToTiKVLeader, currentLatency);

        // TiDB to Client
        await animatePacket(tidbNode, client);
        currentLatency = await updateLatency(clientToTiDBLatency, currentLatency);

        return currentLatency;
    }

    async function runTiDBRangeRead(controlLeaderRegion, dataLeaderRegion) {
        let currentLatency = 0;
        const clientRegion = clientRegionSelect.value;
        const client = 'client';
        const tidbNode = `tidb-${clientRegion}`;
        const pdLeader = `pd-${controlLeaderRegion}`;
        const tikvNode = `tikv-${dataLeaderRegion}`;

        document.querySelectorAll('.tidb-node').forEach(node => node.style.display = 'none');
        const tidbNodeElement = document.getElementById(tidbNode);
        if (tidbNodeElement) tidbNodeElement.style.display = '';

        // Client to TiDB
        const clientToTiDBLatency = getLatency(clientRegion, clientRegion);
        await animatePacket(client, tidbNode);
        currentLatency = await updateLatency(clientToTiDBLatency, currentLatency);

        // TiDB to PD Leader (Get TS)
        const latencyToPD = getLatency(clientRegion, controlLeaderRegion);
        await animatePacket(tidbNode, pdLeader);
        currentLatency = await updateLatency(latencyToPD, currentLatency);

        // PD Leader to TiDB
        await animatePacket(pdLeader, tidbNode);
        currentLatency = await updateLatency(latencyToPD, currentLatency);

        // TiDB to TiKV (Read data)
        const latencyToTiKV = getLatency(clientRegion, dataLeaderRegion);
        await animatePacket(tidbNode, tikvNode);
        currentLatency = await updateLatency(latencyToTiKV, currentLatency);

        // TiKV to TiDB
        await animatePacket(tikvNode, tidbNode);
        currentLatency = await updateLatency(latencyToTiKV, currentLatency);

        // TiDB to Client
        await animatePacket(tidbNode, client);
        currentLatency = await updateLatency(clientToTiDBLatency, currentLatency);

        return currentLatency;
    }

    async function runTiDB2PCWrite(controlLeaderRegion, dataLeaderRegion) { // Percolator 2PC
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

        // Client to TiDB
        const clientToTiDBLatency = getLatency(clientRegion, clientRegion);
        await animatePacket(client, tidbNode);
        currentLatency = await updateLatency(clientToTiDBLatency, currentLatency);

        // Get Commit TS from PD
        const latencyToPD = getLatency(clientRegion, controlLeaderRegion);
        await animatePacket(tidbNode, pdLeader);
        currentLatency = await updateLatency(latencyToPD, currentLatency);

        await animatePacket(pdLeader, tidbNode);
        currentLatency = await updateLatency(latencyToPD, currentLatency);

        // Prewrite Phase
        const latencyToTiKVLeader = getLatency(clientRegion, dataLeaderRegion);
        await animatePacket(tidbNode, tikvLeader); // Prewrite primary
        currentLatency = await updateLatency(latencyToTiKVLeader, currentLatency);

        currentLatency = await animateQuorumWrite(tikvLeader, tikvFollower1, tikvFollower2, currentLatency); // Prewrite primary replication

        await animatePacket(tikvLeader, tidbNode); // Prewrite primary success
        currentLatency = await updateLatency(latencyToTiKVLeader, currentLatency);

        // Commit Phase (Async for Percolator)
        const asyncCommitPromise = (async () => {
            // No latency added for async operations
            await animatePacket(tidbNode, tikvLeader); // Commit primary (async)
            await animateQuorumWrite(tikvLeader, tikvFollower1, tikvFollower2, currentLatency, true); // Commit primary replication (async)
        })();

        // Respond to client after prewrite success
        await animatePacket(tidbNode, client);
        currentLatency = await updateLatency(clientToTiDBLatency, currentLatency);

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

        // Client to local TServer
        const clientToServerLatency = getLatency(clientRegion, clientRegion);
        await animatePacket(client, localTServer);
        currentLatency = await updateLatency(clientToServerLatency, currentLatency);

        // Local TServer to Tablet Leader
        const latencyToLeader = getLatency(clientRegion, dataLeaderRegion);
        await animatePacket(localTServer, tabletLeader);
        currentLatency = await updateLatency(latencyToLeader, currentLatency);

        // Tablet Leader to Local TServer
        await animatePacket(tabletLeader, localTServer);
        currentLatency = await updateLatency(latencyToLeader, currentLatency);

        // Local TServer to Client
        await animatePacket(localTServer, client);
        currentLatency = await updateLatency(clientToServerLatency, currentLatency);

        return currentLatency;
    }

    async function runYugabyte1PCWrite(controlLeaderRegion, dataLeaderRegion) { // Single Row Tx (Raft)
        let currentLatency = 0;
        const clientRegion = clientRegionSelect.value;
        const client = 'client';
        const localTServer = `yb-tserver-${clientRegion}`;
        const tabletLeader = `yb-tserver-${dataLeaderRegion}`;
        const followerRegions = REGIONS.filter(r => r !== dataLeaderRegion);
        const tabletFollower1 = `yb-tserver-${followerRegions[0]}`;
        const tabletFollower2 = `yb-tserver-${followerRegions[1]}`;

        // Client to local TServer
        const clientToServerLatency = getLatency(clientRegion, clientRegion);
        await animatePacket(client, localTServer);
        currentLatency = await updateLatency(clientToServerLatency, currentLatency);

        // Local TServer to Tablet Leader
        const latencyToLeader = getLatency(clientRegion, dataLeaderRegion);
        await animatePacket(localTServer, tabletLeader); // Write to leader
        currentLatency = await updateLatency(latencyToLeader, currentLatency);

        // Tablet Leader to Followers (Quorum Write)
        currentLatency = await animateQuorumWrite(tabletLeader, tabletFollower1, tabletFollower2, currentLatency); // Raft replication

        // Tablet Leader to Local TServer
        await animatePacket(tabletLeader, localTServer); // Ack to coordinator
        currentLatency = await updateLatency(latencyToLeader, currentLatency);

        // Local TServer to Client
        await animatePacket(localTServer, client); // Ack to client
        currentLatency = await updateLatency(clientToServerLatency, currentLatency);

        return currentLatency;
    }

     async function runYugabyteRangeRead(controlLeaderRegion, dataLeaderRegion) { // Multi-Row Read (Simplified)
        let currentLatency = 0;
        const clientRegion = clientRegionSelect.value;
        const client = 'client';
        const localTServer = `yb-tserver-${clientRegion}`;
        const tabletLeader = `yb-tserver-${dataLeaderRegion}`;

        // Client to local TServer
        const clientToServerLatency = getLatency(clientRegion, clientRegion);
        await animatePacket(client, localTServer);
        currentLatency = await updateLatency(clientToServerLatency, currentLatency);

        // Local TServer to Tablet Leader
        const latencyToLeader = getLatency(clientRegion, dataLeaderRegion);
        await animatePacket(localTServer, tabletLeader);
        currentLatency = await updateLatency(latencyToLeader, currentLatency);

        // Tablet Leader to Local TServer
        await animatePacket(tabletLeader, localTServer);
        currentLatency = await updateLatency(latencyToLeader, currentLatency);

        // Local TServer to Client
        await animatePacket(localTServer, client);
        currentLatency = await updateLatency(clientToServerLatency, currentLatency);

        return currentLatency;
    }


    async function runYugabyte2PCWrite(controlLeaderRegion, dataLeaderRegion, transactionLeaderRegion) { // DocDB 2PC
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

        // Client to local TServer
        const clientToServerLatency = getLatency(clientRegion, clientRegion);
        await animatePacket(client, localTServer);
        currentLatency = await updateLatency(clientToServerLatency, currentLatency);

        // Write Transaction Status Record
        const latencyToStatusLeader = getLatency(clientRegion, transactionLeaderRegion);
        await animatePacket(localTServer, transactionStatusTabletLeader);
        currentLatency = await updateLatency(latencyToStatusLeader, currentLatency);

        currentLatency = await animateQuorumWrite(transactionStatusTabletLeader, statusFollower1, statusFollower2, currentLatency);

        await animatePacket(transactionStatusTabletLeader, localTServer); // Ack
        currentLatency = await updateLatency(latencyToStatusLeader, currentLatency);

        // Write Provisional Records
        const latencyToDataLeader = getLatency(clientRegion, dataLeaderRegion);
        await animatePacket(localTServer, involvedTabletLeader);
        currentLatency = await updateLatency(latencyToDataLeader, currentLatency);

        currentLatency = await animateQuorumWrite(involvedTabletLeader, dataFollower1, dataFollower2, currentLatency);

        await animatePacket(involvedTabletLeader, localTServer); // Ack
        currentLatency = await updateLatency(latencyToDataLeader, currentLatency);

        // Commit Status Tablet
        await animatePacket(localTServer, transactionStatusTabletLeader);
        currentLatency = await updateLatency(latencyToStatusLeader, currentLatency);

        currentLatency = await animateQuorumWrite(transactionStatusTabletLeader, statusFollower1, statusFollower2, currentLatency);

        // Apply Phase (Async)
        const asyncApplyPromise = (async () => {
            await animatePacket(transactionStatusTabletLeader, involvedTabletLeader); // Apply provisional records (async)
            await animateQuorumWrite(involvedTabletLeader, dataFollower1, dataFollower2, currentLatency, true); // Apply replication (async)
        })();

        // Ack Commit back to Coordinator
        await animatePacket(transactionStatusTabletLeader, localTServer);
        currentLatency = await updateLatency(latencyToStatusLeader, currentLatency);

        // Ack back to Client
        await animatePacket(localTServer, client);
        currentLatency = await updateLatency(clientToServerLatency, currentLatency);

        await asyncApplyPromise;
        return currentLatency; // Return latency when client is acked
    }


    const scenarioRunners = {
        tidb: {
            'point-read': runTiDBPointRead,
            '1pc-write': runTiDB1PCWrite,
            'range-read': runTiDBRangeRead,
            '2pc-write': runTiDB2PCWrite,
        },
        yugabyte: {
            'point-read': runYugabytePointRead,
            '1pc-write': runYugabyte1PCWrite,
            'range-read': runYugabyteRangeRead,
            '2pc-write': runYugabyte2PCWrite,
        }
    };

    startButton.addEventListener('click', async () => {
        const db = dbTypeSelect.value;
        const req = requestTypeSelect.value;
        const controlLeader = controlLeaderLocationSelect.value;
        const dataLeader = dataLeaderLocationSelect.value;
        const transactionLeader = transactionLeaderLocationSelect.value;

        const runner = scenarioRunners[db]?.[req];

        if (runner) {
            toggleControls(true);
            clearVisualization();
            await sleep(100);

            try {
                if (db === 'yugabyte' && req === '2pc-write') {
                    await runner(controlLeader, dataLeader, transactionLeader);
                } else {
                    await runner(controlLeader, dataLeader);
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

    [clientRegionSelect, dbTypeSelect, requestTypeSelect, controlLeaderLocationSelect, dataLeaderLocationSelect, transactionLeaderLocationSelect].forEach(select => {
        select.addEventListener('change', () => {
            saveControlState();
            updateTransactionLeaderVisibility();

            if (select === clientRegionSelect || select === dbTypeSelect || select === controlLeaderLocationSelect || select === dataLeaderLocationSelect || select === transactionLeaderLocationSelect) {
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
    updateTransactionLeaderVisibility();
    clearVisualization();
});
