import React, { useState, useEffect } from "react";

export default function App() {
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [items, setItems] = useState(() => {
    const saved = localStorage.getItem("zebrol_items");
    return saved ? JSON.parse(saved) : [];
  });

  const [form, setForm] = useState({
    image: "",
    name: "",
    vulgo: "",
    faction: "",
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
      reader.onload = () => {
        setForm((prev) => ({ ...prev, [name]: reader.result }));
      };
      reader.readAsDataURL(files[0]);
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const addItem = () => {
    if (editIndex !== null) {
      setItems((prev) =>
        prev.map((item, i) => (i === editIndex ? { ...form } : item))
      );
      setEditIndex(null);
    } else {
      setItems((prev) => [...prev, { ...form }]);
    }

    setForm({
      image: "",
      name: "",
      vulgo: "",
      faction: "",
      cpf: "",
      birth: "",
      mother: "",
      address: "",
      description: "",
    });
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-8">
      <h1 className="text-3xl font-bold text-center">ZEBROL</h1>

      <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
        {items.map((item, index) => (
          <div
            key={index}
            onClick={() => setSelected({ item, index })}
            className="bg-gray-900 rounded-2xl p-4 shadow-lg cursor-pointer hover:bg-gray-800 transition"
          >
            <div className="w-full h-32 bg-gray-700 rounded mb-3 overflow-hidden">
              {item.image ? (
                <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  Sem foto
                </div>
              )}
            </div>
            <p className="text-center font-semibold">{item.name || "Sem nome"}</p>
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-40">
          <div className="relative bg-gray-900 p-6 rounded-2xl w-full max-w-sm space-y-3 shadow-xl">
            <button
              onClick={() => setSelected(null)}
              className="absolute top-3 right-4 text-red-400 text-sm"
            >
              Fechar
            </button>

            {selected.item.image && (
              <img
                src={selected.item.image}
                alt={selected.item.name}
                className="w-full h-48 object-cover rounded mb-3"
              />
            )}

            <p><strong>Nome:</strong> {selected.item.name}</p>
            <p><strong>Vulgo:</strong> {selected.item.vulgo}</p>
            <p><strong>Facção:</strong> {selected.item.faction}</p>
            <p><strong>CPF:</strong> {selected.item.cpf}</p>
            <p><strong>Nasc.:</strong> {selected.item.birth}</p>
            <p><strong>Mãe:</strong> {selected.item.mother}</p>
            <p><strong>Endereço:</strong> {selected.item.address}</p>
            <p><strong>Descrição:</strong> {selected.item.description}</p>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowForm(true)}
        className="fixed bottom-6 right-6 bg-blue-600 w-14 h-14 rounded-full flex items-center justify-center text-3xl font-bold shadow-2xl hover:bg-blue-700"
      >
        +
      </button>

      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-40">
          <div className="bg-gray-900 p-6 rounded-2xl w-full max-w-sm space-y-3 shadow-xl">
            <h2 className="text-xl font-semibold text-center">Cadastrar / Editar</h2>

            <input type="file" name="image" accept="image/*" onChange={handleChange} />
            <input type="text" name="name" placeholder="Nome" value={form.name} onChange={handleChange} />
            <input type="text" name="vulgo" placeholder="Vulgo" value={form.vulgo} onChange={handleChange} />
            <input type="text" name="faction" placeholder="Facção" value={form.faction} onChange={handleChange} />
            <input type="text" name="cpf" placeholder="CPF" value={form.cpf} onChange={handleChange} />
            <input type="date" name="birth" value={form.birth} onChange={handleChange} />
            <input type="text" name="mother" placeholder="Nome da Mãe" value={form.mother} onChange={handleChange} />
            <input type="text" name="address" placeholder="Endereço" value={form.address} onChange={handleChange} />
            <textarea name="description" placeholder="Descrição" value={form.description} onChange={handleChange} />

            <button
              onClick={() => {
                addItem();
                setShowForm(false);
              }}
              className="w-full bg-blue-600 p-2 rounded-xl font-semibold"
            >
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

