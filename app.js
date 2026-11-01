const DEFAULT_SUPABASE_URL = "https://mbdsegfnlkhnvymannpy.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_3R0SBt0i9zPYrbZMl18tQA_V9Wf20IR";

let channels = [];
let activeCategory = 'ALL';
let currentChannel = null;
let supabaseClient = null;
let hls = null;

let videoPlayer, channelsGrid, searchInput, currentTitle, currentCategory, currentStatus, liveBadge, channelCount;

document.addEventListener('DOMContentLoaded', () => {
    videoPlayer = document.getElementById('videoPlayer');
    channelsGrid = document.getElementById('channelsGrid');
    searchInput = document.getElementById('searchInput');
    currentTitle = document.getElementById('currentChannelTitle');
    currentCategory = document.getElementById('currentChannelCategory');
    currentStatus = document.getElementById('currentChannelStatus');
    liveBadge = document.getElementById('liveBadge');
    channelCount = document.getElementById('channelCount');

    if (!localStorage.getItem('mechatv_sb_url')) {
        localStorage.setItem('mechatv_sb_url', DEFAULT_SUPABASE_URL);
    }
    if (!localStorage.getItem('mechatv_sb_key')) {
        localStorage.setItem('mechatv_sb_key', DEFAULT_SUPABASE_KEY);
    }

    setupEvents();
    initSupabase();
});

function initSupabase() {
    const url = localStorage.getItem('mechatv_sb_url');
    const key = localStorage.getItem('mechatv_sb_key');

    const urlInput = document.getElementById('supabaseUrlInput');
    const keyInput = document.getElementById('supabaseKeyInput');
    if (urlInput) urlInput.value = url || '';
    if (keyInput) keyInput.value = key || '';

    if (url && key && window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseClient = window.supabase.createClient(url, key);
        fetchFromSupabase();
    } else {
        if (currentStatus) currentStatus.textContent = 'Configura las credenciales en ⚙️';
    }
}

async function fetchFromSupabase() {
    if (!supabaseClient) return;
    try {
        if (currentStatus) currentStatus.textContent = 'Cargando canales...';
        
        const { data, error } = await supabaseClient.from('tv_channels').select('*');
        if (error) throw error;

        if (data && data.length > 0) {
            channels = data.map(ch => ({ ...ch, fail_count: ch.fail_count || 0 }));
            filterAndRender();
            if (currentStatus) currentStatus.textContent = `¡Listo! ${channels.length} canales cargados.`;
        } else {
            channels = [];
            filterAndRender();
            if (currentStatus) currentStatus.textContent = 'Sin canales en Supabase.';
        }
    } catch (err) {
        console.error('Error Supabase:', err);
        if (currentStatus) currentStatus.textContent = 'Error de conexión a Supabase.';
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
        channelsGrid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #7f8c8d; padding: 20px;">No hay canales disponibles.</div>';
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
    if (currentStatus) currentStatus.textContent = 'Conectando señal...';
    
    filterAndRender();

    // FORZAR HTTPS: Convierte URLs inseguras para evitar bloqueos del navegador
    let secureUrl = channel.url;
    if (secureUrl.startsWith("http://")) {
        secureUrl = secureUrl.replace("http://", "https://");
    }

    if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        if (hls) hls.destroy();

        hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 0,
            maxBufferLength: 3,
            maxMaxBufferLength: 6,
            liveSyncDurationCount: 1,
            manifestLoadingTimeOut: 3000,
            fragLoadingTimeOut: 3000
        });

        hls.loadSource(secureUrl);
        hls.attachMedia(videoPlayer);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (videoPlayer) {
                videoPlayer.play().catch(() => {});
            }
            if (liveBadge) liveBadge.classList.remove('hidden');
            if (currentStatus) currentStatus.textContent = 'En vivo';
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                console.error("Error en el stream:", data);
                handleStreamError(channel);
            }
        });
    } else if (videoPlayer && videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.src = secureUrl;
        videoPlayer.play().catch(() => {});
        if (liveBadge) liveBadge.classList.remove('hidden');
        if (currentStatus) currentStatus.textContent = 'En vivo';
    }
}

function handleStreamError(channel) {
    channel.fail_count = (channel.fail_count || 0) + 1;
    if (currentStatus) currentStatus.textContent = `⚠️ Señal inestable (${channel.fail_count}/2)`;

    if (channel.fail_count >= 2) {
        channels = channels.filter(c => c.id !== channel.id);
        filterAndRender();
        if (currentStatus) currentStatus.textContent = `🗑️ Canal "${channel.name}" desestimado por falta de señal.`;
        if (liveBadge) liveBadge.classList.add('hidden');
    }
}

function setupEvents() {
    if (searchInput) {
        searchInput.addEventListener('input', filterAndRender);
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
