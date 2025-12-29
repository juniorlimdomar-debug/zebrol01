let dados = JSON.parse(localStorage.getItem("zebrol")) || [];
let selecionado = null;
let editIndex = null;

const grid = document.getElementById("grid");

function render() {
  grid.innerHTML = "";
  dados.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="foto">${p.image ? `<img src="${p.image}">` : "Sem foto"}</div>
      <p>${p.name}</p>
    `;
    div.onclick = () => abrir(i);
    grid.appendChild(div);
  });
}

function abrir(i) {
  selecionado = i;
  const p = dados[i];
  dFoto.src = p.image || "";
  dNome.innerText = p.name;
  dCpf.innerText = p.cpf;
  dBirth.innerText = p.birth;
  dMother.innerText = p.mother;
  dAddress.innerText = p.address;
  dDesc.innerText = p.description;
  modal.classList.remove("hidden");
}

function fecharModal() {
  modal.classList.add("hidden");
}

btnAdd.onclick = () => {
  editIndex = null;
  formTitle.innerText = "Novo Cadastro";
  formModal.classList.remove("hidden");
};

function salvar() {
  const obj = {
    image: imgTemp,
    name: name.value,
    cpf: cpf.value,
    birth: birth.value,
    mother: mother.value,
    address: address.value,
    description: desc.value
  };

  if (editIndex !== null) dados[editIndex] = obj;
  else dados.push(obj);

  localStorage.setItem("zebrol", JSON.stringify(dados));
  formModal.classList.add("hidden");
  render();
}

let imgTemp = "";
image.onchange = e => {
  const r = new FileReader();
  r.onload = () => imgTemp = r.result;
  r.readAsDataURL(e.target.files[0]);
};

function editar() {
  editIndex = selecionado;
  const p = dados[selecionado];
  imgTemp = p.image;
  name.value = p.name;
  cpf.value = p.cpf;
  birth.value = p.birth;
  mother.value = p.mother;
  address.value = p.address;
  desc.value = p.description;
  modal.classList.add("hidden");
  formModal.classList.remove("hidden");
}

function confirmarDelete() {
  confirm.classList.remove("hidden");
}

function excluir() {
  dados.splice(selecionado, 1);
  localStorage.setItem("zebrol", JSON.stringify(dados));
  confirm.classList.add("hidden");
  modal.classList.add("hidden");
  render();
}

function fecharConfirm() {
  confirm.classList.add("hidden");
}

render();
