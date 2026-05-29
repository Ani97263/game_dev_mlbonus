/**
 * DArk : Echo Sector - Bug Hardened Production Engine
 */

// --- GLOBAL CONSTRAINTS & STATE ---
let player_position_x = 200;
let player_position_y = 200;

const keys = {};

// Projectile Doubly Linked List Definition
class BulletNode {
    constructor(data) {
        this.data = data; // {x, y, vx, vy, isEnemy, bounces, radius}
        this.next = null;
        this.prev = null;
    }
}

class BulletLinkedList {
    constructor() {
        this.head = null;
        this.tail = null;
    }
    append(data) {
        const newNode = new BulletNode(data);
        if (!this.head) {
            this.head = newNode;
            this.tail = newNode;
        } else {
            this.tail.next = newNode;
            newNode.prev = this.tail;
            this.tail = newNode;
        }
    }
    remove(node) {
        if (node.prev) node.prev.next = node.next;
        else this.head = node.next;
        if (node.next) node.next.prev = node.prev;
        else this.tail = node.prev;
    }
}

// Singleton Factory for Enemy Spawning with Garbage Collection
const enemy_manager_singleton_controller_factory = {
    spawnPool: [],
    createEnemy(type, x, y) {
        let enemy = {
            id: Math.random(),
            type: type,
            x: x,
            y: y,
            radius: 18,
            hp: type === 'HEAVY' ? 250 : 80,
            state: 'PATROL', 
            angle: Math.random() * Math.PI * 2,
            speed: type === 'DASH' ? 3.5 : 1.5,
            lastShot: 0,
            patrolTarget: { x: x + (Math.random() - 0.5) * 100, y: y + (Math.random() - 0.5) * 100 }
        };
        this.spawnPool.push(enemy);
        return enemy;
    },
    clearAll() {
        // Explicitly clear references to let garbage collector free memory
        this.spawnPool = [];
    }
};

// Global Central Monolith State
const single_global_state_object = {
    gameActive: false,
    player: { hp: 100, maxHp: 100, score: 0, currency: 0, speed: 4, radius: 15 },
    bullets: new BulletLinkedList(),
    enemies: [],
    walls: [], 
    currentRoom: 1,
    history: [],
    
    save_game_state_every_frame() {
        if (this.history.length > 180) this.history.shift(); 
        this.history.push({
            px: player_position_x,
            py: player_position_y,
            score: this.player.score
        });
    }
};

// --- PHYSICS ENGINE & SAT DETECTIONS ---

// Separating Axis Theorem (SAT) Collision Logic
function checkSATCollision(polyA, polyB) {
    const polys = [polyA, polyB];
    for (let i = 0; i < polys.length; i++) {
        const poly = polys[i];
        for (let idx1 = 0; idx1 < poly.length; idx1++) {
            const idx2 = (idx1 + 1) % poly.length;
            const p1 = poly[idx1];
            const p2 = poly[idx2];
            
            const normal = { x: -(p2.y - p1.y), y: p2.x - p1.x };
            
            let minA = null, maxA = null;
            for (let j = 0; j < polyA.length; j++) {
                const proj = normal.x * polyA[j].x + normal.y * polyA[j].y;
                if (minA === null || proj < minA) minA = proj;
                if (maxA === null || proj > maxA) maxA = proj;
            }
            
            let minB = null, maxB = null;
            for (let j = 0; j < polyB.length; j++) {
                const proj = normal.x * polyB[j].x + normal.y * polyB[j].y;
                if (minB === null || proj < minB) minB = proj;
                if (maxB === null || proj > maxB) maxB = proj;
            }
            
            if (maxA < minB || maxB < minA) return false; 
        }
    }
    return true;
}

function createWallPolygon(x, y, w, h) {
    return [
        { x: x, y: y },
        { x: x + w, y: y },
        { x: x + w, y: y + h },
        { x: x, y: y + h }
    ];
}

// Upgraded to 16 sides to avoid corner-clipping flaws
function getCircularEntityPolygon(cx, cy, r) {
    const sides = 16;
    const points = [];
    for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }
    return points;
}

function initRoom() {
    single_global_state_object.walls = [
        createWallPolygon(0, 0, 1280, 30),
        createWallPolygon(0, 690, 1280, 30),
        createWallPolygon(0, 30, 30, 660),
        createWallPolygon(1250, 30, 30, 660),
        createWallPolygon(300, 200, 80, 320),
        createWallPolygon(900, 200, 80, 320),
        createWallPolygon(540, 340, 200, 60)
    ];

    enemy_manager_singleton_controller_factory.clearAll();
    
    enemy_manager_singleton_controller_factory.createEnemy('STANDARD', 640, 150);
    enemy_manager_singleton_controller_factory.createEnemy('DASH', 150, 500);
    enemy_manager_singleton_controller_factory.createEnemy('HEAVY', 1100, 500);
    
    single_global_state_object.enemies = enemy_manager_singleton_controller_factory.spawnPool;
}

// --- CORE GAME LOOP ROUTINE ---

function render_entities_and_update_state(ctx) {
    // 1. Player Key Inputs and Syncs
    let moveX = 0;
    let moveY = 0;
    if (keys['w'] || keys['ArrowUp']) moveY -= single_global_state_object.player.speed;
    if (keys['s'] || keys['ArrowDown']) moveY += single_global_state_object.player.speed;
    if (keys['a'] || keys['ArrowLeft']) moveX -= single_global_state_object.player.speed;
    if (keys['d'] || keys['ArrowRight']) moveX += single_global_state_object.player.speed;

    if (moveX !== 0) {
        player_position_x += moveX;
        let poly = getCircularEntityPolygon(player_position_x, player_position_y, single_global_state_object.player.radius);
        if (single_global_state_object.walls.some(w => checkSATCollision(poly, w))) player_position_x -= moveX;
    }
    if (moveY !== 0) {
        player_position_y += moveY;
        let poly = getCircularEntityPolygon(player_position_x, player_position_y, single_global_state_object.player.radius);
        if (single_global_state_object.walls.some(w => checkSATCollision(poly, w))) player_position_y -= moveY;
    }

    // 2. Process Enemy Finite State Machines (AI Rules)
    const now = Date.now();
    single_global_state_object.enemies.forEach(enemy => {
        const dist = Math.hypot(player_position_x - enemy.x, player_position_y - enemy.y);
        
        if (dist < 280) {
            enemy.state = dist < 140 ? 'ATTACK' : 'CHASE';
        } else {
            enemy.state = 'PATROL';
        }

        if (enemy.state === 'CHASE' || enemy.state === 'ATTACK') {
            enemy.angle = Math.atan2(player_position_y - enemy.y, player_position_x - enemy.x);
            if (enemy.state === 'CHASE') {
                let nextX = enemy.x + Math.cos(enemy.angle) * enemy.speed;
                let nextY = enemy.y + Math.sin(enemy.angle) * enemy.speed;
                
                let ePolyX = getCircularEntityPolygon(nextX, enemy.y, enemy.radius);
                if (!single_global_state_object.walls.some(w => checkSATCollision(ePolyX, w))) enemy.x = nextX;
                
                let ePolyY = getCircularEntityPolygon(enemy.x, nextY, enemy.radius);
                if (!single_global_state_object.walls.some(w => checkSATCollision(ePolyY, w))) enemy.y = nextY;
            }
            
            if (enemy.state === 'ATTACK' && now - enemy.lastShot > (enemy.type === 'HEAVY' ? 1200 : 700)) {
                single_global_state_object.bullets.append({
                    x: enemy.x + Math.cos(enemy.angle) * 22,
                    y: enemy.y + Math.sin(enemy.angle) * 22,
                    vx: Math.cos(enemy.angle) * 5,
                    vy: Math.sin(enemy.angle) * 5,
                    isEnemy: true,
                    bounces: 0,
                    radius: 4
                });
                enemy.lastShot = now;
            }
        } else {
            if (Math.hypot(enemy.patrolTarget.x - enemy.x, enemy.patrolTarget.y - enemy.y) < 10) {
                enemy.patrolTarget = { x: enemy.x + (Math.random() - 0.5) * 200, y: enemy.y + (Math.random() - 0.5) * 200 };
            }
            enemy.angle = Math.atan2(enemy.patrolTarget.y - enemy.y, enemy.patrolTarget.x - enemy.x);
            
            let nextX = enemy.x + Math.cos(enemy.angle) * (enemy.speed * 0.5);
            let nextY = enemy.y + Math.sin(enemy.angle) * (enemy.speed * 0.5);
            
            let ePolyX = getCircularEntityPolygon(nextX, enemy.y, enemy.radius);
            if (!single_global_state_object.walls.some(w => checkSATCollision(ePolyX, w))) enemy.x = nextX;
            
            let ePolyY = getCircularEntityPolygon(enemy.x, nextY, enemy.radius);
            if (!single_global_state_object.walls.some(w => checkSATCollision(ePolyY, w))) enemy.y = nextY;
        }
    });

    // 3. Bullet Updates via CCD Sub-Stepping to Prevent Tunneling
    let node = single_global_state_object.bullets.head;
    while (node !== null) {
        let nextNode = node.next;
        let b = node.data;
        
        let subSteps = 4; // Sub-steps calculation split rule
        let stepVx = b.vx / subSteps;
        let stepVy = b.vy / subSteps;
        let bulletDestroyed = false;

        for (let step = 0; step < subSteps; step++) {
            b.x += stepVx;
            b.y += stepVy;

            let bulletPoly = getCircularEntityPolygon(b.x, b.y, b.radius);
            let collidingWall = null;
            
            for (let w of single_global_state_object.walls) {
                if (checkSATCollision(bulletPoly, w)) {
                    collidingWall = w;
                    break;
                }
            }

            if (collidingWall) {
                if (b.bounces < 2) {
                    // Backstep to instantly clear boundary intersections
                    b.x -= stepVx * 1.5;
                    b.y -= stepVy * 1.5;
                    
                    if (b.x < 45 || b.x > 1235) b.vx *= -1;
                    else b.vy *= -1;
                    
                    b.bounces++;
                    stepVx = b.vx / subSteps;
                    stepVy = b.vy / subSteps;
                } else {
                    single_global_state_object.bullets.remove(node);
                    bulletDestroyed = true;
                    break;
                }
            }
            
            // Validate targeting matrices
            if (b.isEnemy) {
                let pPoly = getCircularEntityPolygon(player_position_x, player_position_y, single_global_state_object.player.radius);
                if (checkSATCollision(bulletPoly, pPoly)) {
                    single_global_state_object.player.hp -= 10;
                    single_global_state_object.bullets.remove(node);
                    bulletDestroyed = true;
                    if (single_global_state_object.player.hp <= 0) endGame(false);
                    break;
                }
            } else {
                let hitEnemyIndex = -1;
                for (let i = 0; i < single_global_state_object.enemies.length; i++) {
                    let enemy = single_global_state_object.enemies[i];
                    let ePoly = getCircularEntityPolygon(enemy.x, enemy.y, enemy.radius);
                    if (checkSATCollision(bulletPoly, ePoly)) {
                        hitEnemyIndex = i;
                        break;
                    }
                }
                if (hitEnemyIndex !== -1) {
                    let enemy = single_global_state_object.enemies[hitEnemyIndex];
                    enemy.hp -= 35;
                    single_global_state_object.bullets.remove(node);
                    bulletDestroyed = true;
                    if (enemy.hp <= 0) {
                        single_global_state_object.enemies.splice(hitEnemyIndex, 1);
                        single_global_state_object.player.score += 100;
                        single_global_state_object.player.currency += 20;
                        checkRoomClear();
                    }
                    break;
                }
            }
        }

        if (!bulletDestroyed && (b.x < 0 || b.x > 1280 || b.y < 0 || b.y > 720)) {
            single_global_state_object.bullets.remove(node);
        }

        node = nextNode;
    }

    // 4. Trace Processing
    single_global_state_object.save_game_state_every_frame();

    // 5. Draw Canvas Layers
    ctx.fillStyle = '#020205';
    ctx.fillRect(0, 0, 1280, 720);

    ctx.fillStyle = '#111122';
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 2;
    single_global_state_object.walls.forEach(w => {
        ctx.beginPath();
        ctx.moveTo(w[0].x, w[0].y);
        for (let p of w) ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    });

    single_global_state_object.enemies.forEach(enemy => {
        ctx.fillStyle = enemy.type === 'HEAVY' ? '#ffaa00' : '#ff0055';
        ctx.beginPath();
        ctx.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(enemy.x, enemy.y);
        ctx.lineTo(enemy.x + Math.cos(enemy.angle) * 25, enemy.y + Math.sin(enemy.angle) * 25);
        ctx.stroke();
    });

    node = single_global_state_object.bullets.head;
    while (node !== null) {
        ctx.fillStyle = node.data.isEnemy ? '#ff0055' : '#00ffcc';
        ctx.shadowBlur = 8;
        ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath();
        ctx.arc(node.data.x, node.data.y, node.data.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; 
        node = node.next;
    }

    ctx.fillStyle = '#00ffcc';
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00ffcc';
    ctx.beginPath();
    ctx.arc(player_position_x, player_position_y, single_global_state_object.player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    document.getElementById('ui-health').innerText = Math.max(0, single_global_state_object.player.hp);
    document.getElementById('ui-score').innerText = single_global_state_object.player.score;
    document.getElementById('ui-room').innerText = single_global_state_object.currentRoom;
    document.getElementById('ui-currency').innerText = single_global_state_object.player.currency;
}

function main_game_loop() {
    if (!single_global_state_object.gameActive) return;
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    render_entities_and_update_state(ctx);
    requestAnimationFrame(main_game_loop);
}

// --- INTERACTIVE EVENT MANAGEMENT ---

window.addEventListener('keydown', e => { keys[e.key] = true; });
window.addEventListener('keyup', e => { keys[e.key] = false; });

window.addEventListener('mousedown', e => {
    if (!single_global_state_object.gameActive) return;
    
    const canvas = document.getElementById('gameCanvas');
    const rect = canvas.getBoundingClientRect();
    
    // Clean mouse coordinate decoding unaffected by container dynamic scaling
    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    const angle = Math.atan2(mouseY - player_position_y, mouseX - player_position_x);
    
    single_global_state_object.bullets.append({
        x: player_position_x + Math.cos(angle) * 20,
        y: player_position_y + Math.sin(angle) * 20,
        vx: Math.cos(angle) * 8,
        vy: Math.sin(angle) * 8,
        isEnemy: false,
        bounces: 0,
        radius: 5
    });
});

function checkRoomClear() {
    if (single_global_state_object.enemies.length === 0) {
        single_global_state_object.currentRoom++;
        single_global_state_object.player.score += 500;
        enemy_manager_singleton_controller_factory.clearAll(); // Flush memory leaks cleanly
        initRoom(); 
    }
}

function startGame() {
    document.getElementById('screen-overlay').classList.add('hidden');
    single_global_state_object.gameActive = true;
    single_global_state_object.player.hp = 100;
    single_global_state_object.player.score = 0;
    single_global_state_object.player.currency = 0;
    single_global_state_object.currentRoom = 1;
    player_position_x = 200;
    player_position_y = 200;
    single_global_state_object.bullets = new BulletLinkedList();
    
    initRoom();
    main_game_loop();
}

function endGame(victory = false) {
    single_global_state_object.gameActive = false;
    const overlay = document.getElementById('screen-overlay');
    const title = document.getElementById('overlay-title');
    const sub = document.getElementById('overlay-sub');
    const btn = document.getElementById('start-btn');
    
    title.innerText = victory ? "SECTOR PURGED" : "SYSTEM CRASH";
    title.style.color = victory ? "#00ffcc" : "#ff0055";
    title.style.textShadow = victory ? "0 0 15px #00ffcc" : "0 0 15px #ff0055";
    sub.innerText = `Final Score achieved: ${single_global_state_object.player.score} across ${single_global_state_object.currentRoom} simulation sectors.`;
    btn.innerText = "REBOOT MATRIX";
    
    overlay.classList.remove('hidden');
}
