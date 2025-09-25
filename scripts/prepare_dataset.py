# scripts/prepare_dataset.py
import pandas as pd
from pathlib import Path

def cargar_dataset(ruta_csv, ruta_imagenes):
    """
    Crea un dataset en formato compatible con Hugging Face a partir de CSV.
    """
    df = pd.read_csv(ruta_csv)
    df["image_path"] = df["filename"].apply(lambda x: str(Path(ruta_imagenes) / x))
    return df[["image_path", "text"]]

if __name__ == "__main__":
    train_df = cargar_dataset("dataset/train_labels.csv", "dataset/train")
    val_df = cargar_dataset("dataset/val_labels.csv", "dataset/val")

    train_df.to_csv("dataset/train_ready.csv", index=False)
    val_df.to_csv("dataset/val_ready.csv", index=False)
    print("Datasets preparados y guardados en train_ready.csv y val_ready.csv")
