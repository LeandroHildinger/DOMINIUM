// DOM Elements
const btnProcessar = document.getElementById('btn-processar');
const btnArquivo = document.getElementById('btn-arquivo');
const msgStatus = document.getElementById('status-msg');
const loadingOverlay = document.getElementById('loading');

// Tabs Logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        // Add active
        btn.classList.add('active');
        const contentId = btn.getAttribute('data-tab');
        document.getElementById(contentId).classList.add('active');
    });
});

// File Selection
btnArquivo.addEventListener('click', async () => {
    let path = await eel.selecionar_arquivo()();
    if (path) {
        document.getElementById('input-excel').value = path;
    }
});

// Process Data
btnProcessar.addEventListener('click', async () => {
    const config = {
        excel: document.getElementById('input-excel').value,
        tipo: document.getElementById('input-tipo').value,
        bw: parseFloat(document.getElementById('input-bw').value),
        h: parseFloat(document.getElementById('input-h').value),
        bf: parseFloat(document.getElementById('input-bf').value),
        hf: parseFloat(document.getElementById('input-hf').value),
        cobrimento: parseFloat(document.getElementById('input-cb').value),

        phi_est: parseFloat(document.getElementById('input-phi-est').value),
        phi_long: parseFloat(document.getElementById('input-phi-long').value),
        n_barras: parseInt(document.getElementById('input-n-barras').value),
        as_sup: parseFloat(document.getElementById('input-as-sup').value),

        auto: document.getElementById('input-auto').checked,
        criterio: document.getElementById('input-criterio').value,
        secao_x: document.getElementById('input-secao-x').value
    };

    if (!config.excel) {
        alert("Selecione um arquivo Excel!");
        return;
    }

    setLoading(true);

    try {
        const res = await eel.processar_backend(config)();

        if (res.error) {
            alert("Erro: " + res.error);
        } else {
            updateDashboard(res);
            // Switch to Results Tab (Combinações by default?)
            document.querySelector('[data-tab="tab-sol"]').click();
        }
    } catch (e) {
        console.error(e);
        alert("Erro de comunicação com o servidor Python.");
    } finally {
        setLoading(false);
    }
});

function setLoading(active) {
    if (active) loadingOverlay.classList.add('visible');
    else loadingOverlay.classList.remove('visible');
}

function updateDashboard(data) {
    // Images
    if (data.plots.sol) document.getElementById('img-sol').src = data.plots.sol;
    if (data.plots.comb) document.getElementById('img-comb').src = data.plots.comb;
    if (data.plots.sec) document.getElementById('img-sec').src = data.plots.sec;

    // Metrics
    const rep = data.report;
    if (rep) {
        document.getElementById('val-pos').textContent = rep.x.toFixed(2) + " m";
        document.getElementById('val-msd').textContent = rep.M_max.toFixed(1) + " kN.m";
        document.getElementById('val-vsd').textContent = rep.V_max.toFixed(1) + " kN";
        document.getElementById('val-fad').textContent = rep.Delta_M.toFixed(1) + " kN.m";

        // Report
        if (data.report_html) {
            document.getElementById('report-container').innerHTML = data.report_html;
        } else if (rep) {
            document.getElementById('report-container').textContent = JSON.stringify(rep, null, 2);
        }
    }
}

// Init
console.log("DOMINIUM Web Initialized");

// Setup T-section visibility toggle
document.getElementById('input-tipo').addEventListener('change', (e) => {
    const isT = e.target.value === 't';
    document.getElementById('input-bf').disabled = !isT;
    document.getElementById('input-hf').disabled = !isT;
});
