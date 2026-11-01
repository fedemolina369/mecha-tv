const DEFAULT_CHANNELS = [
    {
        id: '1',
        name: 'ESPN Demo',
        category: 'Deportes',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_wordmark.svg',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        fail_count: 0
    }
];

let channels = [...DEFAULT_CHANNELS];
let currentChannel = null;
let supabase = null;
let hls = null;

const videoPlayer = document.getElementById('videoPlayer');
const channelsGrid = document.getElementById('channelsGrid');
const searchInput = document.getElementById('searchInput');
const currentTitle = document.getElementById('currentChannelTitle');
const currentCategory = document.getElementById('currentChannelCategory');
const currentStatus = document.getElementById('currentChannelStatus');
const liveBadge = document.getElementById('liveBadge');
const channelCount = document.getElementById('channelCount');

document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
    renderChannels(channels);
    setupEvents();
});

function initSupabase() {
    const url = localStorage.getItem('mechatv_sb_url');
    const key = localStorage.getItem('mechatv_sb_key');

    if (url && key && window.supabase) {
        supabase = window.supabase.createClient(url, key);
        fetchFromSupabase();
    }
}

async function fetchFromSupabase() {
    if (!supabase) return;
    try {
        currentStatus.textContent = 'Cargando canales desde Supabase...';
        const { data, error } = await supabase.from('tv_channels').select('*');
        if (error) throw error;
        if (data && data.length > 0) {
            channels = data.map(ch => ({ ...ch, fail_count: ch.fail_count || 0 }));
            renderChannels(channels);
            currentStatus.textContent = 'Canales sincronizados correctamente.';
        }
    } catch (err) {
        console.error('Error Supabase:', err);
        currentStatus.textContent = 'Error al cargar Supabase. Usando demo.';
    }
}

function renderChannels(channelList) {
    channelsGrid.innerHTML = '';
    channelCount.textContent = `${channelList.length} canales`;

    channelList.forEach(ch => {
        const card = document.createElement('div');
        card.className = `channel-card ${currentChannel?.id === ch.id ? 'active' : ''}`;
        card.innerHTML = `
            <img class="channel-logo" src="${ch.logo}" alt="${ch.name}" onerror="this.src='https://via.placeholder.com/45?text=TV'">
            <span class="channel-name">${ch.name}</span>
        `;
        card.onclick = () => playChannel(ch);
        channelsGrid.appendChild(card);
    });
}

function playChannel(channel) {
    currentChannel = channel;
    currentTitle.textContent = channel.name;
    currentCategory.textContent = channel.category;
    currentStatus.textContent = 'Conectando al stream...';
    
    document.querySelectorAll('.channel-card').forEach(card => card.classList.remove('active'));
    renderChannels(channels);

    if (Hls.isSupported()) {
        if (hls) hls.destroy();
        hls = new Hls({ maxBufferLength: 10 });
        hls.loadSource(channel.url);
        hls.attachMedia(videoPlayer);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            videoPlayer.play();
            liveBadge.classList.remove('hidden');
            currentStatus.textContent = 'Transmitiendo en vivo';
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) handleStreamError(channel);
        });
    } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.src = channel.url;
        videoPlayer.play();
    }
}

function handleStreamError(channel) {
    channel.fail_count = (channel.fail_count || 0) + 1;
    currentStatus.textContent = `⚠️ Error de señal (Intento ${channel.fail_count}/2)`;

    if (channel.fail_count >= 2) {
        channels = channels.filter(c => c.id !== channel.id);
        renderChannels(channels);
        currentStatus.textContent = `🗑️ Canal "${channel.name}" removido por fallos repetidos.`;
        liveBadge.classList.add('hidden');
    }
}

function setupEvents() {
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = channels.filter(c => c.name.toLowerCase().includes(query));
        renderChannels(filtered);
    });

    document.getElementById('categoryContainer').addEventListener('click', (e) => {
        if (!e.target.classList.contains('cat-chip')) return;
        document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');

        const cat = e.target.dataset.category;
        const filtered = cat === 'ALL' ? channels : channels.filter(c => c.category === cat);
        renderChannels(filtered);
    });

    const modal = document.getElementById('configModal');
    document.getElementById('configBtn').onclick = () => modal.classList.remove('hidden');
    document.getElementById('closeConfigBtn').onclick = () => modal.classList.add('hidden');
    
    document.getElementById('saveConfigBtn').onclick = () => {
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