const { useState, useEffect } = React;

function App() {
  const [items, setItems] = useState(() => {
    const saved = localStorage.getItem("zebrol_items");
    return saved ? JSON.parse(saved) : [];
  });

  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [form, setForm] = useState({
    image: "",
    name: "",
    cpf: "",
    birth: "",
    mother: "",
    address: "",
    description: "",
  });

  useEffect(() => {
    localStorage.setItem("zebrol_items", JSON.stringify(items));
  }, [items]);

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (files && files[0]) {
      const reader = new FileReader();
      reader.onload = () => setForm((p) => ({ ...p, [name]: reader.result }));
      reader.readAsDataURL(files[0]);
    } else {
      setForm((p) => ({ ...p, [name]: value }));
    }
  };

  const saveItem = () => {
    if (editIndex !== null) {
      setItems((prev) =>
        prev.map((item, i) => (i === editIndex ? form : item))
      );
      setEditIndex(null);
    } else {
      setItems((prev) => [...prev, form]);
    }

    setForm({
      image: "",
      name: "",
      cpf: "",
      birth: "",
      mother: "",
      address: "",
      description: "",
    });

    setShowForm(false);
  };

  return (
    <div className="app">
      <h1>ZEBROL</h1>

      <div className="grid">
        {items.map((item, index) => (
          <div
            key={index}
            className="card"
            onClick={() => setSelected({ item, index })}
          >
            {item.image ? (
              <img src={item.image} />
            ) : (
              <div className="noimg">Sem foto</div>
            )}
            <p>{item.name || "Sem nome"}</p>
          </div>
        ))}
      </div>

      {selected && (
        <div className="modal">
          <div className="modal-box">
            <button className="close" onClick={() => setSelected(null)}>✕</button>

            {selected.item.image && (
              <img src={selected.item.image} className="bigimg" />
            )}

            <p><b>Nome:</b> {selected.item.name}</p>
            <p><b>CPF:</b> {selected.item.cpf}</p>
            <p><b>Nascimento:</b> {selected.item.birth}</p>
            <p><b>Mãe:</b> {selected.item.mother}</p>
            <p><b>Endereço:</b> {selected.item.address}</p>
            <p><b>Descrição:</b> {selected.item.description}</p>

            <button
              className="edit"
              onClick={() => {
                setForm(selected.item);
                setEditIndex(selected.index);
                setShowForm(true);
              }}
            >✏️</button>

            <button
              className="delete"
              onClick={() => setConfirmDelete(selected.index)}
            >🗑️</button>
          </div>
        </div>
      )}

      {confirmDelete !== null && (
        <div className="modal">
          <div className="confirm">
            <p>Tem certeza que deseja excluir?</p>
            <button
              className="danger"
              onClick={() => {
                setItems((prev) =>
                  prev.filter((_, i) => i !== confirmDelete)
                );
                setConfirmDelete(null);
                setSelected(null);
              }}
            >Sim</button>
            <button onClick={() => setConfirmDelete(null)}>Não</button>
          </div>
        </div>
      )}

      <button className="fab" onClick={() => setShowForm(true)}>+</button>

      {showForm && (
        <div className="modal">
          <div className="modal-box">
            <input type="file" name="image" onChange={handleChange} />
            <input name="name" placeholder="Nome" value={form.name} onChange={handleChange} />
            <input name="cpf" placeholder="CPF" value={form.cpf} onChange={handleChange} />
            <input type="date" name="birth" value={form.birth} onChange={handleChange} />
            <input name="mother" placeholder="Nome da mãe" value={form.mother} onChange={handleChange} />
            <input name="address" placeholder="Endereço" value={form.address} onChange={handleChange} />
            <textarea name="description" placeholder="Descrição" value={form.description} onChange={handleChange} />
            <button onClick={saveItem}>Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
