/**
 * УБЕЖИЩЕ - Психологический Хоррор
 * Движок: Three.js
 */

// ==========================================
// 1. ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ И СОСТОЯНИЯ
// ==========================================
let scene, camera, renderer, clock;
let playerCollider;
let flashlight, ambientLight;
let audioCtx;
let sounds = {};
let mapMesh = [];
let interactables = [];
let monster;
let animationId;

// Состояние игры
const state = {
    isRunning: false,
    isPaused: false,
    isHidden: false,
    isReading: false,
    volume: 0.5,
    graphics: 'medium',
    battery: 100,
    stamina: 100,
    flashlightOn: true,
    inventory: [],
    notesRead: 0,
    monsterActive: true
};

// Физика и управление
const keys = { w: false, a: false, s: false, d: false, shift: false };
const player = {
    speed: 4.0,
    runSpeed: 7.0,
    velocity: new THREE.Vector3(),
    direction: new THREE.Vector3(),
    height: 1.6,
    noise: 0
};
let euler = new THREE.Euler(0, 0, 0, 'YXZ');

// Карта уровня (0 - пол, 1 - стена, 2 - закрытая дверь, 3 - шкаф для пряток, 4 - выход, 5 - щиток)
// 15x15 для лабиринта (30-60 минут геймплея достигаются за счет сложности поиска предметов и пряток от ИИ)
const levelMap = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,1,0,0,0,0,0,1,4,0,1,1],
    [1,0,1,0,1,0,1,1,1,0,2,0,0,5,1],
    [1,0,1,0,0,0,1,0,0,0,1,1,1,1,1],
    [1,0,1,1,1,2,1,0,1,0,0,0,0,0,1],
    [1,0,0,0,0,0,1,0,1,1,1,1,1,0,1],
    [1,1,1,1,1,0,1,0,0,0,0,0,1,0,1],
    [1,0,3,0,1,0,1,1,1,1,1,0,1,0,1],
    [1,0,1,0,0,0,0,0,0,3,1,0,0,0,1],
    [1,0,1,1,1,1,1,1,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,0,0,1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,0,1,1,1,2,1,1,1],
    [1,0,0,3,0,0,1,0,0,0,0,0,0,0,1],
    [1,0,1,1,1,0,1,1,1,1,1,1,1,0,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];
const TILE_SIZE = 4;

// ==========================================
// 2. ПРОЦЕДУРНАЯ ГЕНЕРАЦИЯ (Текстуры и Звуки)
// ==========================================

// Генерация мрачной текстуры стен
function createWallTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0,0,256,256);
    for(let i=0; i<5000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#2a2a2a' : '#0d0d0d';
        ctx.fillRect(Math.random()*256, Math.random()*256, 2, 2);
    }
    // Кровь/ржавчина
    for(let i=0; i<50; i++) {
        ctx.fillStyle = 'rgba(50, 10, 10, 0.3)';
        ctx.beginPath();
        ctx.arc(Math.random()*256, Math.random()*256, Math.random()*15, 0, Math.PI*2);
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    return tex;
}

// Генерация текстуры пола
function createFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0,0,128,128);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(0,0,128,128);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(15, 15);
    return tex;
}

// Аудио движок
function initAudio() {
    if(audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Эмбиент (постоянный гул)
    sounds.ambient = audioCtx.createOscillator();
    sounds.ambientGain = audioCtx.createGain();
    sounds.ambient.type = 'sine';
    sounds.ambient.frequency.value = 40; // Низкий тревожный гул
    sounds.ambientGain.gain.value = state.volume * 0.2;
    sounds.ambient.connect(sounds.ambientGain);
    sounds.ambientGain.connect(audioCtx.destination);
    sounds.ambient.start();

    // Сердцебиение
    sounds.heartbeat = audioCtx.createOscillator();
    sounds.hbGain = audioCtx.createGain();
    sounds.heartbeat.type = 'triangle';
    sounds.heartbeat.frequency.value = 50;
    sounds.hbGain.gain.value = 0;
    sounds.heartbeat.connect(sounds.hbGain);
    sounds.hbGain.connect(audioCtx.destination);
    sounds.heartbeat.start();
    
    setInterval(pulseHeart, 1000);
}

function pulseHeart() {
    if(!state.isRunning || state.isPaused) return;
    let dist = monster ? camera.position.distanceTo(monster.mesh.position) : 100;
    if(dist < 15) {
        let vol = (15 - dist) / 15;
        sounds.hbGain.gain.setValueAtTime(vol * state.volume, audioCtx.currentTime);
        sounds.hbGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    }
}

function playSoundHit() {
    if(!audioCtx) return;
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(100, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, audioCtx.currentTime + 0.5);
    gain.gain.setValueAtTime(state.volume, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);
}

// ==========================================
// 3. ИНИЦИАЛИЗАЦИЯ THREE.JS И СЦЕНЫ
// ==========================================
function initThree() {
    const canvasContainer = document.createElement('div');
    canvasContainer.id = 'game-canvas';
    document.body.appendChild(canvasContainer);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020202);
    scene.fog = new THREE.FogExp2(0x020202, 0.08); // Густой туман

    camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 100);
    
    renderer = new THREE.WebGLRenderer({ antialias: false }); // Отключаем сглаживание для атмосферы
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyGraphicsSettings();
    canvasContainer.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    // Освещение
    ambientLight = new THREE.AmbientLight(0x111122, 0.3);
    scene.add(ambientLight);

    flashlight = new THREE.SpotLight(0xffffff, 1.5, 20, Math.PI/6, 0.5, 1);
    flashlight.castShadow = true;
    scene.add(flashlight);
    scene.add(flashlight.target);

    buildLevel();
    spawnItems();
    initMonster();

    // Загрузка сохранения, если есть
    if (localStorage.getItem('horrorGameState')) {
        document.getElementById('btn-continue').style.display = 'block';
    }

    setupControls();
    window.addEventListener('resize', onWindowResize, false);
}

function applyGraphicsSettings() {
    if(state.graphics === 'low') {
        renderer.shadowMap.enabled = false;
        scene.fog.density = 0.1;
    } else {
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        scene.fog.density = 0.08;
    }
}

// ==========================================
// 4. ПОСТРОЕНИЕ УРОВНЯ И ПРЕДМЕТОВ
// ==========================================
function buildLevel() {
    const wallGeo = new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE * 1.5, TILE_SIZE);
    const wallMat = new THREE.MeshStandardMaterial({ map: createWallTexture(), roughness: 0.9 });
    const floorGeo = new THREE.PlaneGeometry(TILE_SIZE * levelMap[0].length, TILE_SIZE * levelMap.length);
    const floorMat = new THREE.MeshStandardMaterial({ map: createFloorTexture(), roughness: 0.8 });
    
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI/2;
    floor.receiveShadow = true;
    // Центрируем пол
    floor.position.set((levelMap[0].length * TILE_SIZE)/2 - TILE_SIZE/2, 0, (levelMap.length * TILE_SIZE)/2 - TILE_SIZE/2);
    scene.add(floor);

    // Потолок
    const ceiling = new THREE.Mesh(floorGeo, wallMat);
    ceiling.rotation.x = Math.PI/2;
    ceiling.position.copy(floor.position);
    ceiling.position.y = TILE_SIZE * 1.5;
    scene.add(ceiling);

    const doorMat = new THREE.MeshStandardMaterial({ color: 0x331111, roughness: 0.5 });
    const exitMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8 });
    const closetMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x882222, metalness: 0.9 });

    for(let z=0; z<levelMap.length; z++) {
        for(let x=0; x<levelMap[z].length; x++) {
            let type = levelMap[z][x];
            let px = x * TILE_SIZE;
            let pz = z * TILE_SIZE;
            
            if(type === 1) {
                let wall = new THREE.Mesh(wallGeo, wallMat);
                wall.position.set(px, (TILE_SIZE*1.5)/2, pz);
                wall.castShadow = true;
                wall.receiveShadow = true;
                scene.add(wall);
                mapMesh.push(new THREE.Box3().setFromObject(wall));
            } else if(type === 2) {
                // Дверь
                let door = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE*1.5, TILE_SIZE*0.2), doorMat);
                door.position.set(px, (TILE_SIZE*1.5)/2, pz);
                scene.add(door);
                mapMesh.push(new THREE.Box3().setFromObject(door));
                interactables.push({ mesh: door, type: 'door', req: 'Ключ от двери', id: `door_${x}_${z}` });
            } else if(type === 3) {
                // Шкаф (Прятки)
                let closet = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE*0.8, TILE_SIZE*1.4, TILE_SIZE*0.8), closetMat);
                closet.position.set(px, (TILE_SIZE*1.4)/2, pz);
                scene.add(closet);
                mapMesh.push(new THREE.Box3().setFromObject(closet));
                interactables.push({ mesh: closet, type: 'closet', hidePos: new THREE.Vector3(px, player.height, pz) });
            } else if(type === 4) {
                // Выход
                let exit = new THREE.Mesh(new THREE.BoxGeometry(TILE_SIZE, TILE_SIZE*1.5, TILE_SIZE*0.2), exitMat);
                exit.position.set(px, (TILE_SIZE*1.5)/2, pz);
                scene.add(exit);
                mapMesh.push(new THREE.Box3().setFromObject(exit));
                interactables.push({ mesh: exit, type: 'exit', req: 'Мастер-ключ' });
            } else if(type === 5) {
                // Электрощиток
                let box = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.5), boxMat);
                box.position.set(px, 1.5, pz);
                scene.add(box);
                interactables.push({ mesh: box, type: 'electric_box', req: 'Лом' });
            }
        }
    }
}

function spawnItems() {
    const itemGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const createItem = (color, name, type, x, z, text='') => {
        let mesh = new THREE.Mesh(itemGeo, new THREE.MeshStandardMaterial({ color: color }));
        mesh.position.set(x * TILE_SIZE, 0.5, z * TILE_SIZE);
        scene.add(mesh);
        interactables.push({ mesh: mesh, type: type, name: name, text: text });
    };

    // Раскладываем предметы по карте (координаты X, Z по сетке массива)
    createItem(0xffff00, 'Ключ от двери', 'item', 1, 10);
    createItem(0xff0000, 'Мастер-ключ', 'item', 12, 12);
    createItem(0x555555, 'Лом', 'item', 1, 5);
    createItem(0x00ff00, 'Батарейка', 'battery', 5, 1);
    createItem(0x00ff00, 'Батарейка', 'battery', 9, 8);
    
    // Записки (Сюжет)
    const noteText1 = "День 1. Они заперли нас здесь. Эксперимент вышел из-под контроля. Существо реагирует на звук.";
    const noteText2 = "День 4. Оно слепо, но прекрасно слышит. Если отключить питание в главном щитке, защитные системы уничтожат его.";
    const noteText3 = "День 7. Батареек почти не осталось. Я слышу его шаги. Выход заблокирован.";
    createItem(0xffffff, 'Записка 1', 'note', 2, 2, noteText1);
    createItem(0xffffff, 'Записка 2', 'note', 8, 4, noteText2);
    createItem(0xffffff, 'Записка 3', 'note', 1, 12, noteText3);
}

// ==========================================
// 5. ИИ МОНСТРА (Интеллектуальный враг)
// ==========================================
function initMonster() {
    const geo = new THREE.CylinderGeometry(0.6, 0.6, 2, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1 });
    const mesh = new THREE.Mesh(geo, mat);
    
    // Глаза
    const eyeGeo = new THREE.SphereGeometry(0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const eye1 = new THREE.Mesh(eyeGeo, eyeMat);
    eye1.position.set(0.3, 0.8, 0.5);
    const eye2 = new THREE.Mesh(eyeGeo, eyeMat);
    eye2.position.set(-0.3, 0.8, 0.5);
    mesh.add(eye1);
    mesh.add(eye2);

    mesh.position.set(10 * TILE_SIZE, 1, 10 * TILE_SIZE);
    scene.add(mesh);

    monster = {
        mesh: mesh,
        state: 'PATROL', // PATROL, SEARCH, CHASE
        speed: 2.0,
        targetPos: new THREE.Vector3(),
        lastKnownPos: new THREE.Vector3(),
        raycaster: new THREE.Raycaster()
    };
    pickRandomWaypoint();
}

function pickRandomWaypoint() {
    let x = Math.floor(Math.random() * levelMap[0].length);
    let z = Math.floor(Math.random() * levelMap.length);
    if(levelMap[z][x] === 0) {
        monster.targetPos.set(x * TILE_SIZE, 1, z * TILE_SIZE);
    } else {
        pickRandomWaypoint();
    }
}

function updateMonster(delta) {
    if(!state.monsterActive) return;

    let distToPlayer = monster.mesh.position.distanceTo(camera.position);
    
    // Проверка видимости (Raycast)
    let dirToPlayer = new THREE.Vector3().subVectors(camera.position, monster.mesh.position).normalize();
    monster.raycaster.set(monster.mesh.position, dirToPlayer);
    let intersects = monster.raycaster.intersectObjects(scene.children);
    let canSeePlayer = false;
    
    if(!state.isHidden && intersects.length > 0) {
        if(intersects[0].distance >= distToPlayer - 1) { // Если луч не ударился о стену раньше игрока
            canSeePlayer = true;
        }
    }

    // Слух
    let canHearPlayer = (!state.isHidden && player.noise > 0 && distToPlayer < 15);

    // Машина состояний
    if(canSeePlayer && distToPlayer < 12) {
        monster.state = 'CHASE';
        monster.lastKnownPos.copy(camera.position);
        monster.speed = 4.5;
    } else if(canHearPlayer) {
        monster.state = 'SEARCH';
        monster.lastKnownPos.copy(camera.position);
        monster.speed = 3.5;
    } else {
        if(monster.state === 'CHASE') {
            monster.state = 'SEARCH';
        }
    }

    let moveTarget = new THREE.Vector3();

    if(monster.state === 'PATROL') {
        monster.speed = 1.5;
        moveTarget.copy(monster.targetPos);
        if(monster.mesh.position.distanceTo(monster.targetPos) < 1) {
            pickRandomWaypoint();
        }
    } else if(monster.state === 'SEARCH') {
        moveTarget.copy(monster.lastKnownPos);
        if(monster.mesh.position.distanceTo(monster.lastKnownPos) < 1) {
            monster.state = 'PATROL'; // Не нашел
            pickRandomWaypoint();
        }
    } else if(monster.state === 'CHASE') {
        moveTarget.copy(camera.position);
    }

    // Движение к цели с базовым избеганием стен (raycast вперед)
    let moveDir = new THREE.Vector3().subVectors(moveTarget, monster.mesh.position);
    moveDir.y = 0;
    moveDir.normalize();

    // Поворот монстра к направлению движения
    let angle = Math.atan2(moveDir.x, moveDir.z);
    monster.mesh.rotation.y = angle;

    // Избегание стен
    monster.raycaster.set(monster.mesh.position, moveDir);
    let wallHits = monster.raycaster.intersectObjects(scene.children);
    let isBlocked = false;
    for(let hit of wallHits) {
        if(hit.distance < 1.0 && hit.object !== floorMesh(hit.object)) { // грубая проверка
            isBlocked = true; break;
        }
    }

    if(!isBlocked) {
        monster.mesh.position.addScaledVector(moveDir, monster.speed * delta);
    } else {
        // Если застрял - выбираем новую точку
        if(monster.state === 'PATROL') pickRandomWaypoint();
        else {
             // Сдвиг вбок
             let right = new THREE.Vector3(moveDir.z, 0, -moveDir.x);
             monster.mesh.position.addScaledVector(right, monster.speed * delta);
        }
    }

    // Условие смерти
    if(!state.isHidden && distToPlayer < 1.5) {
        triggerDeath();
    }
}

function floorMesh(obj) { return obj.geometry.type === 'PlaneGeometry'; }

// ==========================================
// 6. ИГРОК, УПРАВЛЕНИЕ И ВЗАИМОДЕЙСТВИЯ
// ==========================================
function setupControls() {
    camera.position.set(4, player.height, 4);

    document.addEventListener('mousemove', (e) => {
        if(!state.isRunning || state.isPaused || state.isHidden || state.isReading) return;
        const movementX = e.movementX || e.mozMovementX || e.webkitMovementX || 0;
        const movementY = e.movementY || e.mozMovementY || e.webkitMovementY || 0;
        
        euler.setFromQuaternion(camera.quaternion);
        euler.y -= movementX * 0.002;
        euler.x -= movementY * 0.002;
        euler.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, euler.x));
        camera.quaternion.setFromEuler(euler);
    });

    document.addEventListener('keydown', (e) => {
        if(state.isReading && e.code === 'KeyE') { closeNote(); return; }
        if(state.isHidden && e.code === 'KeyE') { unhide(); return; }
        if(!state.isRunning || state.isPaused) return;

        switch(e.code) {
            case 'KeyW': keys.w = true; break;
            case 'KeyA': keys.a = true; break;
            case 'KeyS': keys.s = true; break;
            case 'KeyD': keys.d = true; break;
            case 'ShiftLeft': keys.shift = true; break;
            case 'KeyF': toggleFlashlight(); break;
            case 'KeyE': interact(); break;
            case 'KeyI': case 'Tab': 
                e.preventDefault(); 
                toggleInventory(); 
                break;
        }
    });

    document.addEventListener('keyup', (e) => {
        switch(e.code) {
            case 'KeyW': keys.w = false; break;
            case 'KeyA': keys.a = false; break;
            case 'KeyS': keys.s = false; break;
            case 'KeyD': keys.d = false; break;
            case 'ShiftLeft': keys.shift = false; break;
        }
    });
}

function updatePlayer(delta) {
    if(state.isHidden || state.isReading) return;

    let isMoving = keys.w || keys.a || keys.s || keys.d;
    let speed = keys.shift && state.stamina > 0 ? player.runSpeed : player.speed;
    
    player.noise = 0;

    if(isMoving) {
        player.direction.z = Number(keys.s) - Number(keys.w);
        player.direction.x = Number(keys.d) - Number(keys.a);
        player.direction.normalize();

        let moveVector = new THREE.Vector3();
        moveVector.copy(player.direction).applyQuaternion(camera.quaternion);
        moveVector.y = 0; // Плоское движение
        moveVector.normalize();

        // Проверка коллизий со стенами
        let oldPos = camera.position.clone();
        camera.position.addScaledVector(moveVector, speed * delta);
        
        let pBox = new THREE.Box3().setFromCenterAndSize(camera.position, new THREE.Vector3(0.5, player.height, 0.5));
        for(let box of mapMesh) {
            if(pBox.intersectsBox(box)) {
                camera.position.copy(oldPos); // Откат при столкновении (скольжение не реализовано для простоты кода)
                break;
            }
        }

        // Шум и стамина
        if(keys.shift && state.stamina > 0) {
            state.stamina -= 15 * delta;
            player.noise = 1.0;
        } else {
            player.noise = 0.3;
        }
        
        // Покачивание камеры (bobbing)
        let time = Date.now() * 0.005;
        camera.position.y = player.height + Math.sin(time * (keys.shift?2:1)) * 0.05;
    } else {
        camera.position.y = player.height;
    }

    if(!keys.shift || !isMoving) {
        state.stamina += 5 * delta;
        if(state.stamina > 100) state.stamina = 100;
    }

    document.getElementById('stamina-bar').style.width = state.stamina + '%';

    // Обновление фонарика
    if(state.flashlightOn) {
        state.battery -= 0.2 * delta;
        if(state.battery <= 0) {
            state.battery = 0;
            toggleFlashlight();
        }
    }
    document.getElementById('battery-level').style.width = state.battery + '%';
    
    // Цвет батареи
    let batColor = state.battery > 50 ? '#0f0' : (state.battery > 20 ? '#ff0' : '#f00');
    document.getElementById('battery-level').style.backgroundColor = batColor;

    flashlight.position.copy(camera.position);
    flashlight.position.y -= 0.3;
    let dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    flashlight.target.position.copy(camera.position).add(dir);

    checkInteractions();
}

function checkInteractions() {
    let raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    let intersects = raycaster.intersectObjects(scene.children, true);
    
    let prompt = document.getElementById('interact-prompt');
    prompt.style.display = 'none';

    if(intersects.length > 0 && intersects[0].distance < 3) {
        let obj = intersects[0].object;
        let intObj = interactables.find(i => i.mesh === obj || i.mesh.children.includes(obj));
        if(intObj) {
            prompt.style.display = 'block';
            if(intObj.type === 'item' || intObj.type === 'battery' || intObj.type === 'note') {
                prompt.innerText = `[E] Взять ${intObj.name}`;
            } else if(intObj.type === 'door' || intObj.type === 'exit') {
                prompt.innerText = `[E] Открыть`;
            } else if(intObj.type === 'closet') {
                prompt.innerText = `[E] Спрятаться`;
            } else if(intObj.type === 'electric_box') {
                prompt.innerText = `[E] Сломать щиток`;
            }
        }
    }
}

function interact() {
    let raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0,0), camera);
    let intersects = raycaster.intersectObjects(scene.children, true);
    
    if(intersects.length > 0 && intersects[0].distance < 3) {
        let obj = intersects[0].object;
        let index = interactables.findIndex(i => i.mesh === obj);
        if(index > -1) {
            let item = interactables[index];
            
            if(item.type === 'item') {
                state.inventory.push(item.name);
                scene.remove(item.mesh);
                interactables.splice(index, 1);
                showHUDMessage(`Собрано: ${item.name}`);
            } else if(item.type === 'battery') {
                state.battery = Math.min(100, state.battery + 50);
                scene.remove(item.mesh);
                interactables.splice(index, 1);
                showHUDMessage(`Батарейка заряжена`);
            } else if(item.type === 'note') {
                readNote(item.text);
                if(!item.read) {
                    item.read = true;
                    state.notesRead++;
                }
            } else if(item.type === 'door') {
                if(state.inventory.includes(item.req)) {
                    scene.remove(item.mesh);
                    // удаляем коллизию
                    mapMesh = mapMesh.filter(b => !b.equals(new THREE.Box3().setFromObject(item.mesh)));
                    interactables.splice(index, 1);
                    showHUDMessage(`Дверь открыта`);
                    playSoundHit();
                } else {
                    showHUDMessage(`Нужен предмет: ${item.req}`);
                }
            } else if(item.type === 'exit') {
                if(state.inventory.includes(item.req)) {
                    checkEndings();
                } else {
                    showHUDMessage(`Нужен предмет: ${item.req}`);
                }
            } else if(item.type === 'closet') {
                hideInCloset(item);
            } else if(item.type === 'electric_box') {
                if(state.inventory.includes(item.req)) {
                    state.monsterActive = false; // Монстр умирает/отключается
                    scene.remove(monster.mesh);
                    scene.remove(item.mesh);
                    interactables.splice(index, 1);
                    ambientLight.intensity = 0.1; // Свет меркнет
                    showHUDMessage(`Питание отключено. Вой стих.`);
                    playSoundHit();
                } else {
                    showHUDMessage(`Нужен предмет: ${item.req}`);
                }
            }
            saveGame();
        }
    }
}

let hudTimer;
function showHUDMessage(msg) {
    let el = document.getElementById('save-indicator');
    el.innerText = msg;
    el.style.display = 'block';
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => { el.style.display = 'none'; }, 2000);
}

function toggleFlashlight() {
    if(state.battery > 0) {
        state.flashlightOn = !state.flashlightOn;
        flashlight.intensity = state.flashlightOn ? 1.5 : 0;
    }
}

// Прятки
let preHidePos = new THREE.Vector3();
function hideInCloset(closetObj) {
    state.isHidden = true;
    preHidePos.copy(camera.position);
    camera.position.copy(closetObj.hidePos);
    document.getElementById('hide-overlay').style.display = 'flex';
    document.getElementById('interact-prompt').style.display = 'none';
}

function unhide() {
    state.isHidden = false;
    camera.position.copy(preHidePos);
    document.getElementById('hide-overlay').style.display = 'none';
}

// Записки
function readNote(text) {
    state.isReading = true;
    document.getElementById('note-text').innerText = text;
    document.getElementById('note-display').style.display = 'block';
    document.exitPointerLock();
}

function closeNote() {
    state.isReading = false;
    document.getElementById('note-display').style.display = 'none';
    document.body.requestPointerLock();
}

// ==========================================
// 7. СИСТЕМА СОХРАНЕНИЙ И МЕНЮ
// ==========================================
function saveGame() {
    try {
        const saveData = {
            pos: {x: camera.position.x, y: camera.position.y, z: camera.position.z},
            rot: {x: euler.x, y: euler.y},
            inventory: state.inventory,
            battery: state.battery,
            notesRead: state.notesRead,
            monsterActive: state.monsterActive
        };
        localStorage.setItem('horrorGameState', JSON.stringify(saveData));
    } catch(e) { console.log('Save failed'); }
}

function loadGame() {
    try {
        const data = JSON.parse(localStorage.getItem('horrorGameState'));
        if(data) {
            camera.position.set(data.pos.x, data.pos.y, data.pos.z);
            euler.set(data.rot.x, data.rot.y, 0, 'YXZ');
            camera.quaternion.setFromEuler(euler);
            state.inventory = data.inventory || [];
            state.battery = data.battery || 100;
            state.notesRead = data.notesRead || 0;
            state.monsterActive = data.monsterActive !== false;
            if(!state.monsterActive) {
                scene.remove(monster.mesh);
            }
        }
    } catch(e) { console.log('Load failed'); }
}

// UI Логика
document.getElementById('btn-start').onclick = () => {
    localStorage.removeItem('horrorGameState');
    startGame();
};
document.getElementById('btn-continue').onclick = () => {
    startGame();
    loadGame();
};
document.getElementById('btn-settings').onclick = () => {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('settings-menu').style.display = 'flex';
};
document.getElementById('btn-settings-back').onclick = () => {
    document.getElementById('settings-menu').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    state.volume = parseFloat(document.getElementById('volume').value);
    state.graphics = document.getElementById('graphics').value;
    if(audioCtx) sounds.ambientGain.gain.value = state.volume * 0.2;
    applyGraphicsSettings();
};
document.getElementById('btn-restart').onclick = () => location.reload();
document.getElementById('btn-victory-menu').onclick = () => location.reload();
document.getElementById('btn-close-inv').onclick = toggleInventory;

function startGame() {
    document.getElementById('main-menu').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    
    initAudio();
    if(!scene) initThree();
    
    state.isRunning = true;
    document.body.requestPointerLock();
    animate();
}

function toggleInventory() {
    if(state.isReading || state.isHidden) return;
    state.isPaused = !state.isPaused;
    
    const invScreen = document.getElementById('inventory-screen');
    if(state.isPaused) {
        document.exitPointerLock();
        invScreen.style.display = 'flex';
        let html = '';
        if(state.inventory.length === 0) html = '<p>Инвентарь пуст</p>';
        else state.inventory.forEach(i => html += `<div class="inv-item">${i}</div>`);
        document.getElementById('inventory-items').innerHTML = html;
    } else {
        invScreen.style.display = 'none';
        document.body.requestPointerLock();
    }
}

// ==========================================
// 8. КОНЦОВКИ И СМЕРТЬ
// ==========================================
function triggerDeath() {
    state.isRunning = false;
    document.exitPointerLock();
    playSoundHit();
    document.getElementById('hud').style.display = 'none';
    document.getElementById('game-over').style.display = 'flex';
    localStorage.removeItem('horrorGameState'); // Пермасмерть
}

function checkEndings() {
    state.isRunning = false;
    document.exitPointerLock();
    document.getElementById('hud').style.display = 'none';
    
    const winScreen = document.getElementById('victory-screen');
    const title = document.getElementById('victory-title');
    const desc = document.getElementById('victory-desc');
    
    if(!state.monsterActive) {
        // Концовка 3: Охотник стал жертвой
        title.innerText = "Истинное Спасение";
        title.style.color = "#00ff00";
        desc.innerText = "Вы не просто сбежали. Вы уничтожили угрозу, отключив питание. Эксперимент завершен.";
    } else if(state.notesRead >= 3) {
        // Концовка 2: Правда
        title.innerText = "Горькая Правда";
        title.style.color = "#ffff00";
        desc.innerText = "Вы выбрались из комплекса и знаете правду об экспериментах. Но поверят ли вам?";
    } else {
        // Концовка 1: Слепой побег
        title.innerText = "Выживший";
        title.style.color = "#ffffff";
        desc.innerText = "Вы вырвались на свободу. Но вы так и не поняли, что это было за место, и почему ОНО гналось за вами.";
    }
    
    winScreen.style.display = 'flex';
    localStorage.removeItem('horrorGameState');
}

// ==========================================
// 9. ГЛАВНЫЙ ЦИКЛ (Game Loop)
// ==========================================
function animate() {
    if(!state.isRunning) return;
    animationId = requestAnimationFrame(animate);
    
    if(state.isPaused) return;

    let delta = clock.getDelta();
    // Ограничение delta для предотвращения багов при сворачивании окна
    if(delta > 0.1) delta = 0.1; 

    updatePlayer(delta);
    updateMonster(delta);
    
    // Мерцание света для атмосферы
    if(Math.random() > 0.98) {
        ambientLight.intensity = 0.1 + Math.random() * 0.2;
    }

    renderer.render(scene, camera);
}

function onWindowResize() {
    if(!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}