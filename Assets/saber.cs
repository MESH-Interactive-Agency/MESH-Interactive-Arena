using UnityEngine;

public class saber : MonoBehaviour
{
    public GameObject controller;

    public Slicer slicer;

    public LayerMask layer;
    private Vector3 _previousPos;

    private void OnTriggerEnter(Collider other)
    {
        //if (other.gameObject.layer == layer.value) ;
        //{

        if ((layer.value & (1 << other.transform.gameObject.layer)) > 0)
        {
            Debug.Log("hit: " + other.transform.gameObject.layer + " - actual layer:" + layer.value);
            slicer.isTouched = true;
            FindObjectOfType<Scoreboard>().IncreaseHits();
            Destroy(other.GetComponent<BoxCollider>());
        }
        else
        {
            Debug.Log("GFY");
        }

        _previousPos = transform.position;
    }
}
