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
      setItems((prev) => prev.map((item, i) => (i === editIndex ? { ...form } : item)));
      setEditIndex(null);
    } else {
      setItems((prev) => [...prev, { ...form }]);
    }
    setForm({ image: "", name: "", cpf: "", birth: "", mother: "", address: "", description: "" });
  };

  const requestDelete = (index) => {
    setConfirmDelete(index);
  };

  const confirmDeleteYes = () => {
    setItems((prev) => prev.filter((_, i) => i !== confirmDelete));
    setConfirmDelete(null);
    setSelected(null);
  };

  const confirmDeleteNo = () => {
    setConfirmDelete(null);
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
                <div className="w-full h-full flex items-center justify-center text-gray-400">Sem foto</div>
              )}
            </div>
            <p className="text-center font-semibold">{item.name || "Sem nome"}</p>
          </div>
        ))}
      </div>

      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-40">
          <div className="relative bg-gray-900 p-6 rounded-2xl w-full max-w-sm space-y-3 shadow-xl">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Detalhes</h3>
              <button onClick={() => setSelected(null)} className="text-red-400 text-sm">Fechar</button>
            </div>

            {selected.item.image && (
              <img src={selected.item.image} alt={selected.item.name} className="w-full h-48 object-cover rounded mb-3" />
            )}

            <p><strong>Nome:</strong> {selected.item.name}</p>
            <p><strong>CPF:</strong> {selected.item.cpf}</p>
            <p><strong>Nasc.:</strong> {selected.item.birth}</p>
            <p><strong>Mãe:</strong> {selected.item.mother}</p>
            <p><strong>Endereço:</strong> {selected.item.address}</p>
            <p><strong>Descrição:</strong> {selected.item.description}</p>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setForm(selected.item);
                setEditIndex(selected.index);
                setShowForm(true);
              }}
              className="absolute bottom-4 left-4 z-50 text-blue-500 text-2xl hover:text-blue-600 cursor-pointer"
              title="Editar"
            >
              ✏️
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                requestDelete(selected.index);
              }}
              className="absolute bottom-4 right-4 z-50 text-red-500 text-2xl hover:text-red-600 cursor-pointer"
              title="Excluir"
            >
              🗑️
            </button>
          </div>
        </div>
      )}

      {confirmDelete !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-2xl w-80 space-y-4 text-center shadow-xl">
            <p className="text-lg font-semibold">Tem certeza que deseja excluir?</p>
            <div className="flex gap-4">
              <button onClick={confirmDeleteYes} className="flex-1 bg-red-600 hover:bg-red-700 p-2 rounded-xl">Sim</button>
              <button onClick={confirmDeleteNo} className="flex-1 bg-gray-700 hover:bg-gray-600 p-2 rounded-xl">Não</button>
            </div>
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
          <div className="bg-gray-900 p-6 rounded-2xl w-full max-w-sm space-y-4 shadow-xl">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Cadastrar Novo</h2>
              <button onClick={() => setShowForm(false)} className="text-red-400 text-sm">Fechar</button>
            </div>

            <input type="file" name="image" accept="image/*" onChange={handleChange} className="w-full bg-gray-800 p-2 rounded" />
            <input type="text" name="name" placeholder="Nome" value={form.name} onChange={handleChange} className="w-full bg-gray-800 p-2 rounded" />
            <input type="text" name="cpf" placeholder="CPF" value={form.cpf} onChange={handleChange} className="w-full bg-gray-800 p-2 rounded" />
            <input type="date" name="birth" value={form.birth} onChange={handleChange} className="w-full bg-gray-800 p-2 rounded" />
            <input type="text" name="mother" placeholder="Nome da Mãe" value={form.mother} onChange={handleChange} className="w-full bg-gray-800 p-2 rounded" />
            <input type="text" name="address" placeholder="Endereço" value={form.address} onChange={handleChange} className="w-full bg-gray-800 p-2 rounded" />
            <textarea name="description" placeholder="Descrição" value={form.description} onChange={handleChange} className="w-full bg-gray-800 p-2 rounded h-24" />

            <div className="flex gap-2">
              <button
                onClick={() => {
                  addItem();
                  setShowForm(false);
                }}
                className="flex-1 bg-blue-600 p-2 rounded-xl font-semibold hover:bg-blue-700"
              >
                Salvar
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-700 p-2 rounded-xl font-medium hover:bg-gray-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
