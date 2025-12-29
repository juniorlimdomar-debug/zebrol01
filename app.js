import React, { useState, useEffect } from "react";

export default function App() {
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
      reader.onload = () => {
        setForm((prev) => ({ ...prev, [name]: reader.result }));
      };
      reader.readAsDataURL(files[0]);
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const saveItem = () => {
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
      cpf: "",
      birth: "",
      mother: "",
      address: "",
      description: "",
    });

    setShowForm(false);
    setSelected(null);
  };

  const confirmDeleteYes = () => {
    setItems((prev) => prev.filter((_, i) => i !== confirmDelete));
    setConfirmDelete(null);
    setSelected(null);
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-8">
      <h1 className="text-3xl font-bold text-center">ZEBROL</h1>

      {/* LISTA */}
      <div className="grid grid-cols-2 gap-4 max-w-md mx-auto">
        {items.map((item, index) => (
          <div
            key={index}
            onClick={() => setSelected({ item, index })}
            className="bg-gray-900 rounded-2xl p-4 cursor-pointer hover:bg-gray-800 transition"
          >
            <div className="w-full h-32 bg-gray-700 rounded mb-3 overflow-hidden">
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">
                  Sem foto
                </div>
              )}
            </div>
            <p className="text-center font-semibold">
              {item.name || "Sem nome"}
            </p>
          </div>
        ))}
      </div>

      {/* DETALHES */}
      {selected && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-40 p-4">
          <div className="relative bg-gray-900 p-6 rounded-2xl w-full max-w-sm space-y-3">
            <div className="flex justify-between">
              <h2 className="text-lg font-semibold">Detalhes</h2>
              <button
                onClick={() => setSelected(null)}
                className="text-red-400 text-sm"
              >
                Fechar
              </button>
            </div>

            {selected.item.image && (
              <img
                src={selected.item.image}
                className="w-full h-48 object-cover rounded"
              />
            )}

            <p><strong>Nome:</strong> {selected.item.name}</p>
            <p><strong>CPF:</strong> {selected.item.cpf}</p>
            <p><strong>Nascimento:</strong> {selected.item.birth}</p>
            <p><strong>Mãe:</strong> {selected.item.mother}</p>
            <p><strong>Endereço:</strong> {selected.item.address}</p>
            <p><strong>Descrição:</strong> {selected.item.description}</p>

            {/* EDITAR */}
            <button
              onClick={() => {
                setForm(selected.item);
                setEditIndex(selected.index);
                setShowForm(true);
              }}
              className="absolute bottom-4 left-4 text-blue-500 text-2xl"
            >
              ✏️
            </button>

            {/* EXCLUIR */}
            <button
              onClick={() => setConfirmDelete(selected.index)}
              className="absolute bottom-4 right-4 text-red-500 text-2xl"
            >
              🗑️
            </button>
          </div>
        </div>
      )}

      {/* CONFIRMAR EXCLUSÃO */}
      {confirmDelete !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-900 p-6 rounded-2xl w-80 space-y-4 text-center">
            <p className="text-lg font-semibold">
              Tem certeza que deseja excluir?
            </p>
            <div className="flex gap-4">
              <button
                onClick={confirmDeleteYes}
                className="flex-1 bg-red-600 p-2 rounded-xl"
              >
                Sim
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 bg-gray-700 p-2 rounded-xl"
              >
                Não
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BOTÃO + */}
      <button
        onClick={() => {
          setForm({
            image: "",
            name: "",
            cpf: "",
            birth: "",
            mother: "",
            address: "",
            description: "",
          });
          setEditIndex(null);
          setShowForm(true);
        }}
        className="fixed bottom-6 right-6 bg-blue-600 w-14 h-14 rounded-full flex items-center justify-center text-3xl font-bold"
      >
        +
      </button>

      {/* FORMULÁRIO */}
      {showForm && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-40 p-4">
          <div className="bg-gray-900 p-6 rounded-2xl w-full max-w-sm space-y-3">
            <h2 className="text-xl font-semibold text-center">
              {editIndex !== null ? "Editar Cadastro" : "Novo Cadastro"}
            </h2>

            <input type="file" name="image" accept="image/*" onChange={handleChange} />
            <input className="w-full bg-gray-800 p-2 rounded" name="name" placeholder="Nome" value={form.name} onChange={handleChange} />
            <input className="w-full bg-gray-800 p-2 rounded" name="cpf" placeholder="CPF" value={form.cpf} onChange={handleChange} />
            <input className="w-full bg-gray-800 p-2 rounded" type="date" name="birth" value={form.birth} onChange={handleChange} />
            <input className="w-full bg-gray-800 p-2 rounded" name="mother" placeholder="Nome da mãe" value={form.mother} onChange={handleChange} />
            <input className="w-full bg-gray-800 p-2 rounded" name="address" placeholder="Endereço" value={form.address} onChange={handleChange} />
            <textarea className="w-full bg-gray-800 p-2 rounded h-24" name="description" placeholder="Descrição" value={form.description} onChange={handleChange} />

            <button onClick={saveItem} className="w-full bg-blue-600 p-2 rounded-xl">
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
