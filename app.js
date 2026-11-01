// Credentials de MECHA TV
const DEFAULT_SUPABASE_URL = "https://mbdsegfnlkhnvymannpy.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_3R0SBt0i9zPYrbZMl18tQA_V9Wf20IR";

let channels = [];
let activeCategory = 'ALL';
let currentChannel = null;
let supabase = null;
let hls = null;

// Elementos del DOM (se inicializan de forma segura al cargar la página)
let videoPlayer, channelsGrid, searchInput, currentTitle, currentCategory, currentStatus, liveBadge, channelCount;

document.addEventListener('DOMContentLoaded', () => {
    // 1. Vincular elementos del DOM tras la carga completa del HTML
    videoPlayer = document.getElementById('videoPlayer');
    channelsGrid = document.getElementById('channelsGrid');
    searchInput = document.getElementById('searchInput');
    currentTitle = document.getElementById('currentChannelTitle');
    currentCategory = document.getElementById('currentChannelCategory');
    currentStatus = document.getElementById('currentChannelStatus');
    liveBadge = document.getElementById('liveBadge');
    channelCount = document.getElementById('channelCount');

    // 2. Pre-cargar credenciales por defecto si no existen en localStorage
    if (!localStorage.getItem('mechatv_sb_url')) {
        localStorage.setItem('mechatv_sb_url', DEFAULT_SUPABASE_URL);
    }
    if (!localStorage.getItem('mechatv_sb_key')) {
        localStorage.setItem('mechatv_sb_key', DEFAULT_SUPABASE_KEY);
    }

    // 3. Inicializar la app y eventos
    setupEvents();
    initSupabase();
});

function initSupabase() {
    const url = localStorage.getItem('mechatv_sb_url');
    const key = localStorage.getItem('mechatv_sb_key');

    // Llenar inputs del modal de configuración con los valores guardados
    const urlInput = document.getElementById('supabaseUrlInput');
    const keyInput = document.getElementById('supabaseKeyInput');
    if (urlInput) urlInput.value = url || '';
    if (keyInput) keyInput.value = key || '';

    if (url && key && window.supabase) {
        supabase = window.supabase.createClient(url, key);
        fetchFromSupabase();
    } else {
        if (currentStatus) currentStatus.textContent = 'Configura las credenciales de Supabase en ⚙️';
    }
}

async function fetchFromSupabase() {
    if (!supabase) return;
    try {
        if (currentStatus) currentStatus.textContent = 'Cargando canales reales desde Supabase...';
        
        const { data, error } = await supabase.from('tv_channels').select('*');
        if (error) throw error;

        if (data && data.length > 0) {
            channels = data.map(ch => ({ ...ch, fail_count: ch.fail_count || 0 }));
            filterAndRender();
            if (currentStatus) currentStatus.textContent = `Sincronización exitosa: ${channels.length} canales disponibles.`;
        } else {
            channels = [];
            filterAndRender();
            if (currentStatus) currentStatus.textContent = 'La tabla de Supabase está vacía. Ejecuta el script de Python.';
        }
    } catch (err) {
        console.error('Error Supabase:', err);
        if (currentStatus) currentStatus.textContent = 'Error al conectar con Supabase. Revisa RLS en la tabla.';
    }
}

function filterAndRender() {
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    
    const filtered = channels.filter(ch => {
        const matchesCategory = (activeCategory === 'ALL' || ch.category === activeCategory);
        const matchesSearch = ch.name.toLowerCase().includes(query);
        return matchesCategory && matchesSearch;
    });

    renderChannels(filtered);
}

function renderChannels(channelList) {
    if (!channelsGrid) return;
    channelsGrid.innerHTML = '';
    if (channelCount) channelCount.textContent = `${channelList.length} canales`;

    if (channelList.length === 0) {
        channelsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #7f8c8d; padding: 20px;">No se encontraron canales.</div>';
        return;
    }

    channelList.forEach(ch => {
        const card = document.createElement('div');
        card.className = `channel-card ${currentChannel?.id === ch.id ? 'active' : ''}`;
        card.innerHTML = `
            <img class="channel-logo" src="${ch.logo}" alt="${ch.name}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/716/716422.png'">
            <span class="channel-name">${ch.name}</span>
        `;
        card.onclick = () => playChannel(ch);
        channelsGrid.appendChild(card);
    });
}

function playChannel(channel) {
    currentChannel = channel;
    if (currentTitle) currentTitle.textContent = channel.name;
    if (currentCategory) currentCategory.textContent = channel.category;
    if (currentStatus) currentStatus.textContent = 'Conectando al stream...';
    
    filterAndRender();

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        if (hls) hls.destroy();
        hls = new Hls({ maxBufferLength: 10 });
        hls.loadSource(channel.url);
        hls.attachMedia(videoPlayer);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (videoPlayer) videoPlayer.play().catch(() => {});
            if (liveBadge) liveBadge.classList.remove('hidden');
            if (currentStatus) currentStatus.textContent = 'Transmitiendo en vivo';
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) handleStreamError(channel);
        });
    } else if (videoPlayer && videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.src = channel.url;
        videoPlayer.play().catch(() => {});
        if (liveBadge) liveBadge.classList.remove('hidden');
        if (currentStatus) currentStatus.textContent = 'Transmitiendo en vivo';
    }
}

function handleStreamError(channel) {
    channel.fail_count = (channel.fail_count || 0) + 1;
    if (currentStatus) currentStatus.textContent = `⚠️ Error de señal (Intento ${channel.fail_count}/2)`;

    if (channel.fail_count >= 2) {
        channels = channels.filter(c => c.id !== channel.id);
        filterAndRender();
        if (currentStatus) currentStatus.textContent = `🗑️ Canal "${channel.name}" removido por fallos repetidos.`;
        if (liveBadge) liveBadge.classList.add('hidden');
    }
}

function setupEvents() {
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            filterAndRender();
        });
    }

    const catContainer = document.getElementById('categoryContainer');
    if (catContainer) {
        catContainer.addEventListener('click', (e) => {
            if (!e.target.classList.contains('cat-chip')) return;
            document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');

            activeCategory = e.target.dataset.category;
            filterAndRender();
        });
    }

    const modal = document.getElementById('configModal');
    const configBtn = document.getElementById('configBtn');
    const closeConfigBtn = document.getElementById('closeConfigBtn');
    const saveConfigBtn = document.getElementById('saveConfigBtn');

    if (configBtn && modal) {
        configBtn.onclick = () => modal.classList.remove('hidden');
    }
    if (closeConfigBtn && modal) {
        closeConfigBtn.onclick = () => modal.classList.add('hidden');
    }
    
    if (saveConfigBtn && modal) {
        saveConfigBtn.onclick = () => {
            const url = document.getElementById('supabaseUrlInput').value.trim();
            const key = document.getElementById('supabaseKeyInput').value.trim();
            if (url && key) {
                localStorage.setItem('mechatv_sb_url', url);
                localStorage.setItem('mechatv_sb_key', key);
                modal.classList.add('hidden');
                initSupabase();
            }
        };
    }
}
